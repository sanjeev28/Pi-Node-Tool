    // DOM Elements
    const junkInput = document.getElementById('junkInput');
    const extractBtn = document.getElementById('extractBtn');
    const clearExtractBtn = document.getElementById('clearExtractBtn');
    const extractStats = document.getElementById('extractStats');
    
    const ipInput = document.getElementById('ipListInput');
    const checkBtn = document.getElementById('checkBtn');
    const clearCheckBtn = document.getElementById('clearCheckBtn');
    const inputStats = document.getElementById('inputStats');
    
    const resultBox = document.getElementById('resultBox');
    const resultStats = document.getElementById('resultStats');
    const copyResultBtn = document.getElementById('copyResultBtn');
    const clearResultBtn = document.getElementById('clearResultBtn');
    
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            if (tabId === 'extract') {
                document.getElementById('extractTab').classList.add('active');
            } else {
                document.getElementById('checkTab').classList.add('active');
            }
        });
    });
    
    // Store results
    let workingIPs = [];
    let deadIPs = [];
    let testnetIPs = [];
    let extractedIPs = [];
    
    // ============ EXTRACT FUNCTION ============
    function extractAddressesFromJunk(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const tables = doc.querySelectorAll('table');
        
        if (tables.length === 0) {
            return [];
        }
        
        const connectedAddresses = [];
        
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                
                // Check if row has "Connected" status
                let isConnected = false;
                for (let i = 0; i < cells.length; i++) {
                    const cellText = cells[i].innerText || cells[i].textContent || '';
                    if (cellText.toLowerCase().includes('connected')) {
                        isConnected = true;
                        break;
                    }
                }
                
                if (!isConnected) return;
                
                // Extract address
                let foundAddress = null;
                const codeElements = row.querySelectorAll('code');
                for (let code of codeElements) {
                    const codeText = code.textContent.trim();
                    if (codeText.match(/\d+\.\d+\.\d+\.\d+:\d+/)) {
                        foundAddress = codeText;
                        break;
                    }
                }
                
                if (!foundAddress) {
                    for (let i = 0; i < cells.length; i++) {
                        const cellText = cells[i].textContent.trim();
                        if (cellText.match(/\d+\.\d+\.\d+\.\d+:\d+/)) {
                            foundAddress = cellText;
                            break;
                        }
                    }
                }
                
                if (foundAddress) {
                    let modifiedAddress = foundAddress;
                    if (foundAddress.includes(':31402')) {
                        modifiedAddress = foundAddress.replace(/:31402\b/g, ':31401');
                    }
                    connectedAddresses.push(modifiedAddress);
                }
            });
        });
        
        return [...new Set(connectedAddresses)];
    }
    
    function performExtraction() {
        const rawJunk = junkInput.value;
        if (!rawJunk.trim()) {
            extractStats.innerHTML = '⚠️ Please paste junk HTML/table code first.';
            resultBox.innerHTML = '⚠️ No HTML to extract. Paste junk code in Step 1.';
            return;
        }
        
        extractStats.innerHTML = '🔄 Extracting addresses...';
        
        setTimeout(() => {
            const addresses = extractAddressesFromJunk(rawJunk);
            extractedIPs = addresses;
            
            if (addresses.length === 0) {
                extractStats.innerHTML = '❌ No "Connected" nodes found.';
                resultBox.innerHTML = '❌ No addresses with "Connected" status found.\n\nMake sure your HTML contains rows with "Connected" badge.';
                return;
            }
            
            // Display extracted IPs
            let html = `<div style="color: #2ecc71; margin-bottom: 10px;">✅ EXTRACTED IPs (${addresses.length}):</div>`;
            for (const ip of addresses) {
                html += `<div>📌 ${ip}</div>`;
            }
            html += `\n\n<hr><div class="small-text">💡 Copy these IPs, go to Step 2, paste and click CHECK</div>`;
            resultBox.innerHTML = html;
            
            extractStats.innerHTML = `📋 Extracted ${addresses.length} IP:port addresses (31402→31401 applied)`;
            
            // Also fill the IP list textarea for convenience
            ipInput.value = addresses.join('\n');
            inputStats.innerHTML = `📋 Loaded ${addresses.length} extracted IPs | Click CHECK to verify`;
        }, 10);
    }
    
    // ============ CHECK & FILTER FUNCTIONS ============
    function parseIPList(text) {
        const lines = text.split(/\r?\n/);
        const ips = [];
        for (let line of lines) {
            line = line.trim();
            const match = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+)/);
            if (match) {
                ips.push(match[1]);
            } else if (line.includes(':') && !line.startsWith('http')) {
                ips.push(line);
            }
        }
        return [...new Set(ips)];
    }
    
    async function checkIPAndNetwork(ipPort, timeout = 8000) {
        const url = `http://${ipPort}`;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                mode: 'cors',
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch(e) {
                    return { live: false, network: null, error: 'Invalid JSON' };
                }
                
                if (data && data.network_passphrase) {
                    const network = data.network_passphrase;
                    if (network === "Pi Network") {
                        return { live: true, network: 'Pi Network', url: url };
                    } else if (network === "Pi Testnet") {
                        return { live: false, network: 'Pi Testnet', error: 'Testnet - excluded' };
                    } else {
                        return { live: false, network: network, error: 'Unknown network' };
                    }
                } else {
                    return { live: false, network: null, error: 'No network_passphrase field' };
                }
            } else {
                return { live: false, network: null, error: `HTTP ${response.status}` };
            }
        } catch (error) {
            return { live: false, network: null, error: error.message };
        }
    }
    
    async function checkAllIPs(ips) {
        workingIPs = [];
        deadIPs = [];
        testnetIPs = [];
        
        const total = ips.length;
        let completed = 0;
        
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.innerText = `Checking 0/${total} IPs...`;
        
        resultBox.innerHTML = '<div style="color: #f1c40f;">⏳ Checking IPs and filtering Pi Network nodes...</div>\n\n';
        
        const concurrency = 3;
        const results = [];
        
        for (let i = 0; i < ips.length; i += concurrency) {
            const batch = ips.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map(async (ip) => {
                const result = await checkIPAndNetwork(ip);
                completed++;
                const percent = (completed / total) * 100;
                progressFill.style.width = `${percent}%`;
                progressText.innerText = `Checking ${completed}/${total} IPs...`;
                return { ip, ...result };
            }));
            results.push(...batchResults);
            
            const tempWorking = results.filter(r => r.live && r.network === 'Pi Network').map(r => `http://${r.ip}`);
            resultBox.innerHTML = `<div style="color: #f1c40f;">⏳ Checking: ${completed}/${total} done</div>
                                    <div style="color: #2ecc71; margin-top: 10px;">✅ Pi Network found: ${tempWorking.length}</div>
                                    <pre style="margin-top: 10px;">${tempWorking.slice(0, 10).join('\n')}${tempWorking.length > 10 ? '\n...' : ''}</pre>`;
        }
        
        for (const result of results) {
            if (result.live && result.network === 'Pi Network') {
                workingIPs.push(result.ip);
            } else if (result.network === 'Pi Testnet') {
                testnetIPs.push(result.ip);
            } else {
                deadIPs.push(result.ip);
            }
        }
        
        return { working: workingIPs, dead: deadIPs, testnet: testnetIPs };
    }
    
    function displayResults() {
        if (workingIPs.length === 0 && deadIPs.length === 0 && testnetIPs.length === 0) {
            resultBox.innerHTML = '❌ No IPs found or checked. Paste IP:port list and click CHECK.';
            resultStats.innerHTML = '📊 No results';
            return;
        }
        
        let html = '';
        
        if (workingIPs.length > 0) {
            html += `<div style="color: #2ecc71; margin-bottom: 15px;">✅ PI NETWORK NODES (${workingIPs.length}):</div>`;
            html += `<div style="margin-bottom: 20px;">`;
            for (const ip of workingIPs) {
                html += `<div style="padding: 6px 0; font-family: monospace;">🌐 http://${ip}</div>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="color: #e74c3c;">❌ No Pi Network nodes found</div>`;
        }
        
        if (testnetIPs.length > 0) {
            html += `<hr><div style="color: #f39c12; margin-top: 15px;">⚠️ EXCLUDED - Pi Testnet (${testnetIPs.length}):</div>`;
            html += `<div style="font-size: 10px; color: #888; max-height: 120px; overflow-y: auto;">`;
            for (const ip of testnetIPs.slice(0, 10)) {
                html += `<div>🔸 http://${ip} (Testnet - ignored)</div>`;
            }
            if (testnetIPs.length > 10) {
                html += `<div>... and ${testnetIPs.length - 10} more</div>`;
            }
            html += `</div>`;
        }
        
        resultBox.innerHTML = html;
        
        resultStats.innerHTML = `
            🟢 Pi Network: <span class="working-count">${workingIPs.length}</span> | 
            🟡 Pi Testnet: <span class="testnet-count">${testnetIPs.length}</span> | 
            🔴 Dead: <span class="dead-count">${deadIPs.length}</span> | 
            📊 Total: ${workingIPs.length + deadIPs.length + testnetIPs.length}
        `;
    }
    
    async function performCheck() {
        const rawText = ipInput.value;
        if (!rawText.trim()) {
            resultBox.innerHTML = '⚠️ Please paste your IP:port list first.';
            resultStats.innerHTML = '📊 No IPs to check';
            return;
        }
        
        const ips = parseIPList(rawText);
        
        if (ips.length === 0) {
            resultBox.innerHTML = '❌ No valid IP:port addresses found.\n\nMake sure each line contains: 192.168.1.1:31401';
            resultStats.innerHTML = '📊 No valid IPs detected';
            return;
        }
        
        inputStats.innerHTML = `🔍 Found ${ips.length} IP(s) to check... Scanning for Pi Network`;
        resultBox.innerHTML = `🔍 Scanning ${ips.length} IP(s) for Pi Network nodes...<br><br>📡 Checking each IP...`;
        
        checkBtn.disabled = true;
        checkBtn.textContent = '⏳ CHECKING...';
        
        await checkAllIPs(ips);
        displayResults();
        
        checkBtn.disabled = false;
        checkBtn.textContent = '🔍 CHECK & FILTER PI NETWORK';
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 1000);
    }
    
    function copyWorkingIPs() {
        if (workingIPs.length === 0) {
            alert('No Pi Network IPs found. Run the check first or extract first.');
            return;
        }
        
        const textToCopy = workingIPs.map(ip => `http://${ip}`).join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyResultBtn.textContent;
            copyResultBtn.textContent = '✅ Copied!';
            setTimeout(() => {
                copyResultBtn.textContent = '📋 Copy Pi Network URLs';
            }, 2000);
        }).catch(() => {
            alert('Could not copy. Select manually.');
        });
    }
    
    function clearResults() {
        resultBox.innerHTML = '💡 Results cleared. Use Step 1 or Step 2 to start over.';
        resultStats.innerHTML = '📊 No results';
        workingIPs = [];
        deadIPs = [];
        testnetIPs = [];
        progressContainer.style.display = 'none';
    }
    
    function clearExtract() {
        junkInput.value = '';
        extractStats.innerHTML = '📊 Ready - Paste junk HTML and click EXTRACT';
    }
    
    function clearCheck() {
        ipInput.value = '';
        inputStats.innerHTML = '📊 Ready - Paste IP list and click CHECK';
    }
    
    // Event listeners
    extractBtn.addEventListener('click', performExtraction);
    clearExtractBtn.addEventListener('click', clearExtract);
    checkBtn.addEventListener('click', performCheck);
    clearCheckBtn.addEventListener('click', clearCheck);
    copyResultBtn.addEventListener('click', copyWorkingIPs);
    clearResultBtn.addEventListener('click', clearResults);
