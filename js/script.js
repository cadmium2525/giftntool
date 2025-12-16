
// State
let selectedMonsters = {
    // Feature 1
    gf_f: null, gf_ff: null, gf_fm: null,
    gf_m: null, gf_mf: null, gf_mm: null,
    // Feature 2
    opt_child: null,
    // Feature 3
    rev_child: null, rev_f: null, rev_ff: null, rev_fm: null, rev_m: null, rev_mf: null, rev_mm: null,
    // Feature 4
    gen_ff: null, gen_fm: null, gen_mf: null, gen_mm: null
};

// Set of excluded IDs
let excludedMonsters = new Set();

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    renderMonstersToModal();
    renderExclusionModal();
    updateAllPlaceholders();
    updateExclusionCounts();
});

// --- Logic Helpers ---

// Get compatibility from matrix. Row: Younger, Col: Older
function getComb(youngerIdx, olderIdx) {
    if (youngerIdx === null || olderIdx === null) return 0;
    if (!COMPATIBILITY_MATRIX[youngerIdx]) return 0;
    return COMPATIBILITY_MATRIX[youngerIdx][olderIdx] || 0;
}

// Calculate total compatibility score
function calculateScore(childId, fId, ffId, fmId, mId, mfId, mmId, sec3, sec2, noble) {
    if (childId === null || fId === null || ffId === null || fmId === null || mId === null || mfId === null || mmId === null) return 0;

    let term1 = getComb(childId, fId);
    let term2 = Math.min(getComb(fId, ffId), getComb(childId, ffId));
    let term3 = Math.min(getComb(fId, fmId), getComb(childId, fmId));
    let term4 = getComb(childId, mId);
    let term5 = Math.min(getComb(mId, mfId), getComb(childId, mfId));
    let term6 = Math.min(getComb(mId, mmId), getComb(childId, mmId));
    let term7 = getComb(fId, mId);

    let base = 224;
    let bonus = (sec2 * 5) + (sec3 * 12.5) + Number(noble);

    return term1 + term2 + term3 + term4 + term5 + term6 + term7 + base + bonus;
}

function getSymbol(score) {
    if (score >= 660) return "👑";
    if (score >= 614) return "☆";
    if (score >= 490) return "◎";
    if (score >= 374) return "○";
    if (score >= 255) return "△";
    return "×";
}

// --- Feature 1: Gift Search ---
function runGiftSearch() {
    const s3 = Number(document.getElementById('secret3').value);
    const s2 = Number(document.getElementById('secret2').value);
    const noble = Number(document.getElementById('noble').value);

    const ids = [selectedMonsters.gf_f, selectedMonsters.gf_ff, selectedMonsters.gf_fm,
    selectedMonsters.gf_m, selectedMonsters.gf_mf, selectedMonsters.gf_mm];

    if (ids.every(x => x !== null)) {
        let results = [];
        MONSTER_NAMES.forEach((name, idx) => {
            let s = calculateScore(idx, ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], s3, s2, noble);
            results.push({ id: idx, name: name, score: s, symbol: getSymbol(s) });
        });
        results.sort((a, b) => b.score - a.score);
        renderResults('gift-results', results);
        return;
    }

    if (ids.some(x => x === null)) {
        alert("親・祖父母をすべて指定してください");
        return;
    }
}

// --- Feature 2: Optimization ---
function runOptimization() {
    const childId = selectedMonsters.opt_child;
    const targetSymbolScore = Number(document.getElementById('target-symbol').value);

    if (childId === null) {
        alert("育成モンスター(子)を選択してください");
        return;
    }

    // Filtered Monster Indices
    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    let bestP = [];
    let bestM = [];

    for (let i of validMonsters) {
        let maxGPScore = -1;
        let bestGPId = -1;

        for (let gp of validMonsters) {
            let val = Math.min(getComb(i, gp), getComb(childId, gp));
            if (val > maxGPScore) {
                maxGPScore = val;
                bestGPId = gp;
            }
        }

        let pScore = getComb(childId, i) + (maxGPScore * 2);
        bestP.push({ id: i, score: pScore, gp: bestGPId });

        let mScore = getComb(childId, i) + (maxGPScore * 2);
        bestM.push({ id: i, score: mScore, gp: bestGPId });
    }

    let maxTotal = -1;
    let bestCombo = null;

    for (let p of bestP) {
        for (let m of bestM) {
            let fmScore = getComb(p.id, m.id);
            let total = p.score + m.score + fmScore + 224;

            if (total > maxTotal) {
                maxTotal = total;
                bestCombo = {
                    f: p.id, ff: p.gp, fm: p.gp,
                    m: m.id, mf: m.gp, mm: m.gp,
                    rawScore: total
                };
            }
        }
    }

    if (!bestCombo) {
        alert("有効な結果が見つかりませんでした (除外リストを確認してください)");
        return;
    }

    let finalScore = maxTotal;
    let items = { s3: 0, s2: 0, noble: 0 };

    if (targetSymbolScore !== 999 && finalScore < targetSymbolScore) {
        let diff = targetSymbolScore - finalScore;

        // Use Math.round logic (Consistent with Reverse Search)
        let s3Part = diff * (12 / 25);
        let s2Part = diff * (1 / 25);

        let n3 = Math.round(s3Part / 12.5);
        let n2 = Math.round(s2Part / 5);

        let currentCover = (n3 * 12.5) + (n2 * 5);
        let remainder = diff - currentCover;
        let nn = Math.ceil(remainder);
        if (nn < 0) nn = 0;

        if ((n3 * 12.5) + (n2 * 5) + nn < diff) {
            nn = Math.ceil(diff - ((n3 * 12.5) + (n2 * 5)));
        }

        items.s3 = n3;
        items.s2 = n2;
        items.noble = nn;

        finalScore += (items.s3 * 12.5) + (items.s2 * 5) + items.noble;
    }

    render2x3Result('opt-results', bestCombo, finalScore, items);
}

// --- Feature 3: Completion Search ---
function runReverseOpt() {
    const childId = selectedMonsters.rev_child;
    if (childId === null) {
        alert("育成モンスター(子)を選択してください");
        return;
    }

    const slots = {
        f: selectedMonsters.rev_f,
        ff: selectedMonsters.rev_ff,
        fm: selectedMonsters.rev_fm,
        m: selectedMonsters.rev_m,
        mf: selectedMonsters.rev_mf,
        mm: selectedMonsters.rev_mm
    };

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    function getBestUnit(isMother) {
        let p = isMother ? slots.m : slots.f;
        let gp1 = isMother ? slots.mf : slots.ff;
        let gp2 = isMother ? slots.mm : slots.fm;

        let candidates = [];
        let pList = (p !== null) ? [p] : validMonsters;

        for (let i of pList) {
            if (p === null && excludedMonsters.has(i)) continue;

            let gp1List = (gp1 !== null) ? [gp1] : validMonsters;
            let maxGP1 = -1, bestGP1 = null;
            for (let g of gp1List) {
                let val = Math.min(getComb(i, g), getComb(childId, g));
                if (val > maxGP1) { maxGP1 = val; bestGP1 = g; }
            }

            let gp2List = (gp2 !== null) ? [gp2] : validMonsters;
            let maxGP2 = -1, bestGP2 = null;
            for (let g of gp2List) {
                let val = Math.min(getComb(i, g), getComb(childId, g));
                if (val > maxGP2) { maxGP2 = val; bestGP2 = g; }
            }

            if (bestGP1 === null || bestGP2 === null) continue;

            let base = getComb(childId, i);
            candidates.push({
                id: i,
                gp1: bestGP1,
                gp2: bestGP2,
                score: base + maxGP1 + maxGP2
            });
        }
        return candidates;
    }

    let pUnits = getBestUnit(false);
    let mUnits = getBestUnit(true);

    if (pUnits.length === 0 || mUnits.length === 0) {
        alert("探索候補が見つかりませんでした");
        return;
    }

    let maxTotal = -1;
    let best = null;

    for (let p of pUnits) {
        for (let m of mUnits) {
            let fmScore = getComb(p.id, m.id);
            let total = p.score + m.score + fmScore + 224;
            if (total > maxTotal) {
                maxTotal = total;
                best = {
                    f: p.id, ff: p.gp1, fm: p.gp2,
                    m: m.id, mf: m.gp1, mm: m.gp2,
                    rawScore: total
                };
            }
        }
    }

    // Calculate items if needed
    let finalScore = maxTotal;
    let items = { s3: 0, s2: 0, noble: 0 };
    const targetSymbolScore = Number(document.getElementById('target-symbol-rev').value);

    // Calc helper
    function calculateItemsNeeded(diff) {
        // Ratio (Value Contribution): 12 : 1 : 12
        let s3Part = diff * (12 / 25);
        let s2Part = diff * (1 / 25);

        // Use Math.round to approximate the target part without over-ceiling
        let n3 = Math.round(s3Part / 12.5);
        let n2 = Math.round(s2Part / 5);

        // Calculate current cover
        let currentCover = (n3 * 12.5) + (n2 * 5);
        let remainder = diff - currentCover;

        // Fill remainder with Noble (1pt). 
        // If remainder is negative (overshot), we might have negative Nobles? 
        // Improve: if remainder negative, try reducing n2 or n3?
        // Simple approach: Clamp Noble to 0 if remainder is negative, 
        // but that means we overshot. That's acceptable for "meeting target".
        // BUT user wants "minimum necessary". 
        // If we overshot, maybe we should reduce count?
        // E.g. if diff=10, s3Part=4.8 -> n3=0. s2=0.4 -> n2=0. rem=10. noble=10. (OK)
        // E.g. diff=15. s3Part=7.2 -> n3=1(12.5). rem=2.5. noble=3. Total 15.5. (OK)
        // E.g. diff=18. s3Part=8.64 -> n3=1. rem=5.5. noble=6. Total 18.5. (OK)

        let nn = Math.ceil(remainder);
        if (nn < 0) nn = 0; // Should not happen with round if parts sum to diff, but rounding can overshoot.

        // Re-check total
        if ((n3 * 12.5) + (n2 * 5) + nn < diff) {
            nn = Math.ceil(diff - ((n3 * 12.5) + (n2 * 5)));
        }

        return { s3: n3, s2: n2, noble: nn };
    }

    if (targetSymbolScore !== 999 && finalScore < targetSymbolScore) {
        items = calculateItemsNeeded(targetSymbolScore - finalScore);
        finalScore += (items.s3 * 12.5) + (items.s2 * 5) + items.noble;
    }

    render2x3Result('rev-opt-results', best, finalScore, items);
}

// --- Feature 4: General Search ---
function runGeneralSearch() {
    const ids = [selectedMonsters.gen_ff, selectedMonsters.gen_fm,
    selectedMonsters.gen_mf, selectedMonsters.gen_mm];
    if (ids.some(x => x === null)) {
        alert("祖父母をすべて指定してください");
        return;
    }

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    let bestPair = null;
    let maxMinScore = -1;

    for (let f of validMonsters) {
        for (let m of validMonsters) {
            let minScore = 9999;
            for (let c = 0; c < MONSTER_NAMES.length; c++) {
                let s = calculateScore(c, f, ids[0], ids[1], m, ids[2], ids[3], 0, 0, 0);
                if (s < minScore) minScore = s;
            }
            if (minScore > maxMinScore) {
                maxMinScore = minScore;
                bestPair = { f: f, m: m, val: minScore };
            }
        }
    }

    const container = document.getElementById('gen-results');

    let headerHTML = `
        <div style="grid-column: span 5;">
             <div class="result-card-2x3">
                <div class="result-header">推奨ペア (最低保証 ${bestPair.val.toFixed(1)})</div>
                <div class="result-parents-grid">
                    <div class="parent-label">父親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[bestPair.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[bestPair.f]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[0]]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[ids[0]]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[1]]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[ids[1]]}</div></div>
                </div>
                <div class="result-parents-grid">
                    <div class="parent-label">母親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[bestPair.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[bestPair.m]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[2]]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[ids[2]]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[3]]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[ids[3]]}</div></div>
                </div>
            </div>
        </div>
    `;

    let list = [];
    for (let c = 0; c < MONSTER_NAMES.length; c++) {
        let s = calculateScore(c, bestPair.f, ids[0], ids[1], bestPair.m, ids[2], ids[3], 0, 0, 0);
        list.push({ id: c, name: MONSTER_NAMES[c], score: s, symbol: getSymbol(s) });
    }
    list.sort((a, b) => b.score - a.score);

    let gridHTML = list.map(item => `
        <div class="result-card">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `).join('');

    container.innerHTML = headerHTML + gridHTML;
}

// --- UI Helpers ---

function resetInputs(feature) {
    if (feature === 'gift') {
        selectedMonsters.gf_f = null; selectedMonsters.gf_ff = null; selectedMonsters.gf_fm = null;
        selectedMonsters.gf_m = null; selectedMonsters.gf_mf = null; selectedMonsters.gf_mm = null;
        document.getElementById('secret3').value = 0;
        document.getElementById('secret2').value = 0;
        document.getElementById('noble').value = 0;
        document.getElementById('v3-val').innerText = '0';
        document.getElementById('v2-val').innerText = '0';
        document.getElementById('noble-val').innerText = '0';
        document.getElementById('gift-results').innerHTML = '';
    }
    if (feature === 'opt') {
        selectedMonsters.opt_child = null;
        document.getElementById('target-symbol').value = "999";
        document.getElementById('opt-results').innerHTML = '';
    }
    if (feature === 'rev') {
        selectedMonsters.rev_child = null;
        selectedMonsters.rev_f = null; selectedMonsters.rev_ff = null; selectedMonsters.rev_fm = null;
        selectedMonsters.rev_m = null; selectedMonsters.rev_mf = null; selectedMonsters.rev_mm = null;
        document.getElementById('target-symbol-rev').value = "999";
        document.getElementById('rev-opt-results').innerHTML = '';
    }
    if (feature === 'gen') {
        selectedMonsters.gen_ff = null; selectedMonsters.gen_fm = null;
        selectedMonsters.gen_mf = null; selectedMonsters.gen_mm = null;
        document.getElementById('gen-results').innerHTML = '';
    }
    saveToLocalStorage();
    updateAllPlaceholders();
}

function render2x3Result(containerId, combo, finalScore, items) {
    const container = document.getElementById(containerId);
    let itemsHTML = '';
    if (items) {
        itemsHTML = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #444; font-size:0.9rem; text-align:center;">
            <div>推奨共通秘伝数・加算値</div>
            <div style="color:var(--accent-color); font-weight:bold; margin-top:5px;">
                共通秘伝Ⅲ：${items.s3}個, 共通秘伝Ⅱ：${items.s2}個, ノーブル秘伝：${items.noble}
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="result-card-2x3">
            <div class="result-header">
                ${getSymbol(finalScore)} <span style="font-size:1.2rem; margin-left:10px; font-weight:bold;">${finalScore.toFixed(1)}</span>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">父親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[combo.f]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.ff]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.ff]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.fm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.fm]}</div></div>
            </div>
            
            <div class="result-parents-grid">
                <div class="parent-label">母親側</div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[combo.m]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mf]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[combo.mf]}</div></div>
                <div class="mini-card"><img src="images/${MONSTER_NAMES[combo.mm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[combo.mm]}</div></div>
            </div>
            
            ${itemsHTML}
        </div>
    `;
}


function switchTab(tabId, navEl) {
    document.querySelectorAll('section').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    navEl.classList.add('active');
}

let currentModalTarget = null;

function openMonsterModal(slotKey) {
    currentModalTarget = slotKey;
    document.getElementById('monster-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('monster-modal').classList.remove('open');
}

function selectMonster(idx) {
    if (currentModalTarget) {
        selectedMonsters[currentModalTarget] = idx;
        saveToLocalStorage();
        updateAllPlaceholders();
    }
    closeModal();
}

function openExclusionModal() {
    document.getElementById('exclusion-modal').classList.add('open');
}

function closeExclusionModal() {
    document.getElementById('exclusion-modal').classList.remove('open');
    updateExclusionCounts();
}

function toggleExclusion(idx) {
    if (excludedMonsters.has(idx)) {
        excludedMonsters.delete(idx);
    } else {
        excludedMonsters.add(idx);
    }
    renderExclusionModal();
    saveToLocalStorage();
}

function renderExclusionModal() {
    const grid = document.getElementById('exclusion-grid');
    grid.innerHTML = MONSTER_NAMES.map((name, idx) => {
        const isExcluded = excludedMonsters.has(idx);
        const style = isExcluded ? 'background: #500; border: 1px solid red;' : '';
        return `
        <div class="modal-item" style="${style}" onclick="toggleExclusion(${idx})">
            <div>
                <img src="images/${name}.png" alt="${name}" style="width:32px; height:32px; display:block; margin:0 auto; opacity:${isExcluded ? 0.5 : 1}"><br>
                ${name}
            </div>
        </div>
    `}).join('');
}

function updateExclusionCounts() {
    const count = excludedMonsters.size;
    document.getElementById('exclusion-count-opt').innerText = `${count}体 除外中`;
    document.getElementById('exclusion-count-rev').innerText = `${count}体 除外中`;
    document.getElementById('exclusion-count-gen').innerText = `${count}体 除外中`;

    // Update small icons
    const renderIcons = (containerId) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = Array.from(excludedMonsters).map(id =>
            `<img src="images/${MONSTER_NAMES[id]}.png" class="excluded-icon" title="${MONSTER_NAMES[id]}">`
        ).join('');
    };

    renderIcons('exclusion-icons-opt');
    renderIcons('exclusion-icons-rev');
    renderIcons('exclusion-icons-gen');
}

function updateAllPlaceholders() {
    for (let key in selectedMonsters) {
        const idx = selectedMonsters[key];
        const el = document.querySelector(`.monster-btn[data-slot="${key}"]`);
        if (!el) continue;

        if (idx !== null) {
            el.innerHTML = `<img src="images/${MONSTER_NAMES[idx]}.png" onerror="this.src=''">${MONSTER_NAMES[idx]}`;
            el.classList.remove('placeholder');
        } else {
            el.innerHTML = "選択";
            el.classList.add('placeholder');
        }
    }
}

function renderMonstersToModal() {
    const grid = document.getElementById('modal-grid');
    grid.innerHTML = MONSTER_NAMES.map((name, idx) => `
        <div class="modal-item" onclick="selectMonster(${idx})">
            <div>
                <img src="images/${name}.png" alt="${name}" style="width:32px; height:32px; display:block; margin:0 auto;"><br>
                ${name}
            </div>
        </div>
    `).join('');
}

function renderResults(containerId, list) {
    const container = document.getElementById(containerId);
    container.innerHTML = list.map(item => `
        <div class="result-card">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `).join('');
}

function saveToLocalStorage() {
    localStorage.setItem('mf_sim_data', JSON.stringify(selectedMonsters));
    localStorage.setItem('mf_sim_excluded', JSON.stringify(Array.from(excludedMonsters)));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('mf_sim_data');
    if (data) {
        selectedMonsters = JSON.parse(data);
    }
    const exData = localStorage.getItem('mf_sim_excluded');
    if (exData) {
        excludedMonsters = new Set(JSON.parse(exData));
    }
}
