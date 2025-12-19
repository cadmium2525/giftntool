
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
    gen_ff: null, gen_fm: null, gen_mf: null, gen_mm: null,
    // Feature 4: Matching Mode
    gen_match_p: null, gen_match_gp1: null, gen_match_gp2: null
};

// Target Bloodline State
let searchTargetMode = 'all'; // 'all' or 'designated'
let targetBloodlines = new Set(); // Stores IDs of selected monsters

// Set of excluded IDs
let excludedMonsters = new Set();

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    renderMonstersToModal();
    renderExclusionModal();
    updateAllPlaceholders();
    updateAllPlaceholders();
    updateExclusionCounts();
    renderExclusionModal();
    updateAllPlaceholders();
    updateAllPlaceholders();
    updateExclusionCounts();
    syncSliderLabels();
    initPatchSystem(); // Initialize Data/Patch System
});

function syncSliderLabels() {
    const s3 = document.getElementById('secret3');
    const s2 = document.getElementById('secret2');
    const noble = document.getElementById('noble');

    if (s3) document.getElementById('v3-val').innerText = s3.value;
    if (s2) document.getElementById('v2-val').innerText = s2.value;
    if (noble) document.getElementById('noble-val').innerText = noble.value;
}

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

        // Prepare context for image saving
        const context = {
            f: ids[0], ff: ids[1], fm: ids[2],
            m: ids[3], mf: ids[4], mm: ids[5],
            s3: s3, s2: s2, noble: noble
        };

        renderResults('gift-results', results, context);
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

    // Collect all candidates
    let allCandidates = [];

    for (let p of bestP) {
        for (let m of bestM) {
            let fmScore = getComb(p.id, m.id);
            let total = p.score + m.score + fmScore + 224;

            allCandidates.push({
                f: p.id, ff: p.gp, fm: p.gp,
                m: m.id, mf: m.gp, mm: m.gp,
                child: childId,
                rawScore: total
            });
        }
    }

    if (allCandidates.length === 0) {
        alert("有効な結果が見つかりませんでした (除外リストを確認してください)");
        return;
    }

    // Sort descending
    allCandidates.sort((a, b) => b.rawScore - a.rawScore);

    // Top 10
    const topCombos = allCandidates.slice(0, 10);

    renderTabbedResults('opt-results', topCombos, targetSymbolScore);
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

    let allCandidates = [];

    for (let p of pUnits) {
        for (let m of mUnits) {
            let fmScore = getComb(p.id, m.id);
            let total = p.score + m.score + fmScore + 224;

            allCandidates.push({
                f: p.id, ff: p.gp1, fm: p.gp2,
                m: m.id, mf: m.gp1, mm: m.gp2,
                child: childId,
                rawScore: total
            });
        }
    }

    if (allCandidates.length === 0) {
        alert("有効な結果が見つかりませんでした");
        return;
    }

    // Sort
    allCandidates.sort((a, b) => b.rawScore - a.rawScore);

    // Top 10
    const topCombos = allCandidates.slice(0, 10);
    const targetSymbolScore = Number(document.getElementById('target-symbol-rev').value);

    renderTabbedResults('rev-opt-results', topCombos, targetSymbolScore);
}

// --- Feature 4: General Search ---
function runGeneralSearch() {
    // Check mode
    const mode = document.getElementById('gen_mode').value;
    if (mode === 'matching') {
        runMatchingSearch();
        return;
    }

    // Existing Grandparents Search Logic
    const fixedIds = [selectedMonsters.gen_ff, selectedMonsters.gen_fm,
    selectedMonsters.gen_mf, selectedMonsters.gen_mm];

    // Count nulls
    const nullCount = fixedIds.filter(x => x === null).length;

    if (nullCount > 2) {
        alert("空きスロットは2つまでにしてください（処理負荷のため）");
        return;
    }

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) validMonsters.push(i);
    }

    // UI: Show loading, hide previous results
    const loadingDiv = document.getElementById('gen-loading');
    const resultContainer = document.getElementById('gen-results');
    loadingDiv.style.display = 'block';
    resultContainer.innerHTML = '';

    // Defer execution to allow UI to render
    setTimeout(() => {
        // Search state
        let maxMinScore = -1;
        let bestSolution = null;

        // Determine targets
        let targets = null;
        if (searchTargetMode === 'designated' && targetBloodlines.size > 0) {
            targets = Array.from(targetBloodlines);
        } else if (searchTargetMode === 'designated' && targetBloodlines.size === 0) {
            // Fallback if empty
            // alert('育成対象が選択されていません。全血統モードで実行します。');
            targets = null;
        }

        // Helper to calculate min score for a full lineage
        function evaluateLineage(f, m, gps) {
            let minScore = 9999;
            const loopTargets = (targets && targets.length > 0) ? targets : Array.from({ length: MONSTER_NAMES.length }, (_, i) => i);

            for (let c of loopTargets) {
                // calculateScore(child, f, ff, fm, m, mf, mm, ...)
                // gps is [ff, fm, mf, mm]
                let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
                if (s < minScore) minScore = s;
            }
            return minScore;
        }

        // Recursive solver for missing grandparents
        // currentGPs: array of 4 (some null)
        // missingIndices: array of indices [0, 1, 2, 3] that are null
        // depth: current index in missingIndices
        function solveGPs(f, m, currentGPs, missingIndices, depth) {
            if (depth === missingIndices.length) {
                // All filled
                let val = evaluateLineage(f, m, currentGPs);
                if (val > maxMinScore) {
                    maxMinScore = val;
                    // Clone currentGPs because it's reused
                    bestSolution = { f: f, m: m, gps: [...currentGPs], val: val };
                }
                return;
            }

            let targetIndex = missingIndices[depth];
            for (let cand of validMonsters) {
                currentGPs[targetIndex] = cand;
                solveGPs(f, m, currentGPs, missingIndices, depth + 1);
                currentGPs[targetIndex] = null; // Backtrack (though not strictly needed as we overwrite)
            }
        }

        // Identify missing indices
        let missingIndices = [];
        for (let i = 0; i < 4; i++) {
            if (fixedIds[i] === null) missingIndices.push(i);
        }

        // Main loop: Iterate Parents
        for (let f of validMonsters) {
            for (let m of validMonsters) {
                // Prepare a working copy of GPs
                let workingGPs = [...fixedIds];
                solveGPs(f, m, workingGPs, missingIndices, 0);
            }
        }

        // Search Complete - hide loading
        loadingDiv.style.display = 'none';

        if (!bestSolution) {
            alert("有効な結果が見つかりませんでした");
            return;
        }

        const container = document.getElementById('gen-results');
        // FIX: Remove grid class from container to avoid layout breakage
        container.classList.remove('result-grid');

        const ids = bestSolution.gps; // The filled GPs

        // NOTE: We want to capture BOTH the header (recommended pair) and the list (all monsters).
        // So we wrap them in one div id="capture-gen".

        let contentHTML = `
            <div id="capture-gen" style="padding:10px; background:#121212;">
                <div style="margin-bottom:15px;">
                     <div class="result-card-2x3">
                        <div class="result-header">推奨系統 (最低保証 ${bestSolution.val.toFixed(1)})</div>
                        <div class="result-parents-grid">
                            <div class="parent-label">父親側</div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[bestSolution.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[bestSolution.f]}</div></div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[0]]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[ids[0]]}</div></div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[1]]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[ids[1]]}</div></div>
                        </div>
                        <div class="result-parents-grid">
                            <div class="parent-label">母親側</div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[bestSolution.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[bestSolution.m]}</div></div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[2]]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[ids[2]]}</div></div>
                            <div class="mini-card"><img src="images/${MONSTER_NAMES[ids[3]]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[ids[3]]}</div></div>
                        </div>
                    </div>
                </div>
        `;

        let list = [];
        for (let c = 0; c < MONSTER_NAMES.length; c++) {
            let s = calculateScore(c, bestSolution.f, ids[0], ids[1], bestSolution.m, ids[2], ids[3], 0, 0, 0);
            list.push({ id: c, name: MONSTER_NAMES[c], score: s, symbol: getSymbol(s) });
        }
        list.sort((a, b) => b.score - a.score);

        let gridHTML = list.map(item => {
            const isDesignated = (searchTargetMode === 'designated' && targetBloodlines.has(item.id));
            const highlightClass = isDesignated ? 'designated-highlight' : '';

            return `
            <div class="result-card ${highlightClass}">
                <img src="images/${item.name}.png" onerror="this.src=''">
                <div>${item.name}</div>
                <div class="result-score">${item.score.toFixed(1)}</div>
                <div class="result-symbol">${item.symbol}</div>
            </div>
        `}).join('');

        contentHTML += `
                <div class="result-grid" style="margin-top:0;">${gridHTML}</div>
            </div>
            <div style="text-align:center; margin-top:15px;">
                <button class="save-img-btn" onclick="saveAsImage('capture-gen', 'general_search_result')">📷 画像を保存</button>
            </div>
        `;

        container.innerHTML = contentHTML;

    }, 50); // Small delay to let UI render loading spinner
}

// --- Feature 4: Matching Search (New) ---
function runMatchingSearch() {
    const p = selectedMonsters.gen_match_p;
    const gp1 = selectedMonsters.gen_match_gp1;
    const gp2 = selectedMonsters.gen_match_gp2;

    if (p === null || gp1 === null || gp2 === null) {
        alert("親・祖父・祖母の3体をすべて指定してください。");
        return;
    }

    const resultContainer = document.getElementById('gen-results');
    resultContainer.classList.remove('result-grid'); // Fix layout
    resultContainer.innerHTML = '';
    const loadingDiv = document.getElementById('gen-loading');
    loadingDiv.style.display = 'block';

    const validMonsters = [];
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        if (!excludedMonsters.has(i)) {
            validMonsters.push(i);
        }
    }

    // Helper to calculate min score for a full lineage
    function evaluateLineage(f, m, gps, targets) {
        let minScore = 9999;
        const loopTargets = (targets && targets.length > 0) ? targets : Array.from({ length: MONSTER_NAMES.length }, (_, i) => i);

        for (let c of loopTargets) {
            // calculateScore(child, f, ff, fm, m, mf, mm, ...)
            // gps is [ff, fm, mf, mm]
            let s = calculateScore(c, f, gps[0], gps[1], m, gps[2], gps[3], 0, 0, 0);
            if (s < minScore) minScore = s;
        }
        return minScore;
    }

    setTimeout(() => {
        let targets = null;
        if (searchTargetMode === 'designated' && targetBloodlines.size > 0) {
            targets = Array.from(targetBloodlines);
        } else if (searchTargetMode === 'designated' && targetBloodlines.size === 0) {
            alert('育成対象が選択されていません。全血統モードで実行します。');
            targets = null; // Fallback
        }

        let bestScore = -1;
        let bestCombo = null; // { mode: 'A'|'B', partnerP, partnerGP1, partnerGP2, fullLineage }

        // Pattern A: Input is Father side (f=P, ff=GP1, fm=GP2)
        // Search Mother side (m, mf, mm)
        // Fixed: f, ff, fm
        const f = p;
        const ff = gp1;
        const fm = gp2;

        for (let m of validMonsters) {
            for (let mf of validMonsters) {
                for (let mm of validMonsters) {
                    // lineage: f, m, [ff, fm, mf, mm]
                    let score = evaluateLineage(f, m, [ff, fm, mf, mm], targets);
                    if (score > bestScore) {
                        bestScore = score;
                        bestCombo = {
                            mode: 'A', // Input is Father
                            f: f, m: m,
                            gps: [ff, fm, mf, mm]
                        };
                    }
                }
            }
        }

        // Pattern B: Input is Mother side (m=P, mf=GP1, mm=GP2)
        // Search Father side (f, ff, fm)
        // Fixed: m, mf, mm
        const m = p;
        const mf = gp1;
        const mm = gp2;

        for (let fIter of validMonsters) {
            for (let ffIter of validMonsters) {
                for (let fmIter of validMonsters) {
                    // lineage: fIter, m, [ffIter, fmIter, mf, mm]
                    let score = evaluateLineage(fIter, m, [ffIter, fmIter, mf, mm], targets);
                    if (score > bestScore) {
                        bestScore = score;
                        bestCombo = {
                            mode: 'B', // Input is Mother
                            f: fIter, m: m,
                            gps: [ffIter, fmIter, mf, mm]
                        };
                    }
                }
            }
        }

        loadingDiv.style.display = 'none';

        if (!bestCombo) {
            resultContainer.innerHTML = '<div style="color:white; padding:10px;">探索結果なし</div>';
            return;
        }

        renderMatchingResult(resultContainer, bestCombo, bestScore);

    }, 100);
}

function renderMatchingResult(container, combo, score) {
    let html = '';

    // Determine labels based on mode
    let fLabel = "父親 (相方)";
    const fClass = ""; // Removed highlight class
    let mLabel = "母親 (固定)";
    const mClass = ""; // Removed highlight class

    if (combo.mode === 'A') {
        // Input was Father (Fixed), Found Mother (Partner)
        fLabel = "父親 (固定)";
        mLabel = "母親 (相方)";
    }

    // Helper to get name
    const getName = (id) => (id !== null) ? MONSTER_NAMES[id] : '？';
    const getImg = (id) => (id !== null) ? `images/${MONSTER_NAMES[id]}.png` : '';

    // Reuse render2x3 styled structure but custom labels
    // We already have combo.f, combo.m, combo.gps = [ff, fm, mf, mm]
    const fId = combo.f;
    const mId = combo.m;
    const [ffId, fmId, mfId, mmId] = combo.gps;

    // Fixed vs Found Logic:
    // User requested removal of Highlights and "HIT" labels.
    // We retain structure but simplify visual cues.

    const fIsFound = (combo.mode === 'B');
    const mIsFound = (combo.mode === 'A');

    html += `
    <div id="capture-gen-match" style="padding:10px; background:#121212;">
    <div class="result-card-2x3">
        <div class="result-header">
            ${getSymbol(score)} <span style="font-size:1.2rem; margin-left:10px; font-weight:bold;">${score.toFixed(1)}</span>
            <span style="font-size:0.8rem; color:#aaa; margin-left:10px;">
                ${fIsFound ? '母側固定 / 父側探索結果' : '父側固定 / 母側探索結果'}
            </span>
        </div>
        
        <div class="result-parents-grid">
            <div class="parent-label">父親側</div>
            <div class="mini-card"><img src="${getImg(fId)}" onerror="this.src=''"><div>父<br>${getName(fId)}</div></div>
            <div class="mini-card"><img src="${getImg(ffId)}" onerror="this.src=''"><div>祖父<br>${getName(ffId)}</div></div>
            <div class="mini-card"><img src="${getImg(fmId)}" onerror="this.src=''"><div>祖母<br>${getName(fmId)}</div></div>
        </div>
        
        <div class="result-parents-grid">
            <div class="parent-label">母親側</div>
            <div class="mini-card"><img src="${getImg(mId)}" onerror="this.src=''"><div>母<br>${getName(mId)}</div></div>
            <div class="mini-card"><img src="${getImg(mfId)}" onerror="this.src=''"><div>祖父<br>${getName(mfId)}</div></div>
            <div class="mini-card"><img src="${getImg(mmId)}" onerror="this.src=''"><div>祖母<br>${getName(mmId)}</div></div>
        </div>
    </div>
    `;

    // --- Append Full List of Scores (User Request) ---
    // Generate list for the found combination
    const resultList = [];
    for (let c = 0; c < MONSTER_NAMES.length; c++) {
        let s = calculateScore(c, fId, ffId, fmId, mId, mfId, mmId, 0, 0, 0);
        resultList.push({
            name: MONSTER_NAMES[c],
            score: s,
            symbol: getSymbol(s)
        });
    }

    // Sort by score descending (User Request)
    resultList.sort((a, b) => b.score - a.score);

    // Reuse logic from renderResults to generate grid HTML
    const listHtml = resultList.map(item => {
        // Highlight in list if designated
        const isDesignated = (searchTargetMode === 'designated' && targetBloodlines.has(MONSTER_NAMES.indexOf(item.name)));
        const highlightClass = isDesignated ? 'designated-highlight' : '';

        return `
        <div class="result-card ${highlightClass}">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `}).join('');

    html += `
    <div style="margin-top:20px; font-size:0.9rem; color:#aaa; text-align:center;">全モンスター相性一覧</div>
    <div class="result-grid">
        ${listHtml}
    </div>
    </div> <!-- Close capture div -->
    <div style="text-align:center; margin-top:15px;">
        <button class="save-img-btn" onclick="saveAsImage('capture-gen-match', 'general_matching_result')">📷 画像を保存</button>
    </div>
    `;

    container.innerHTML = html;
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
        const mode = document.getElementById('gen_mode').value;
        if (mode === 'matching') {
            selectedMonsters.gen_match_p = null;
            selectedMonsters.gen_match_gp1 = null;
            selectedMonsters.gen_match_gp2 = null;
        } else {
            selectedMonsters.gen_ff = null;
            selectedMonsters.gen_fm = null;
            selectedMonsters.gen_mf = null;
            selectedMonsters.gen_mm = null;
        }
        document.getElementById('gen-results').innerHTML = '';
    }
    saveToLocalStorage();
    updateAllPlaceholders();
}

// --- Feature 4 Mode Toggle ---
function toggleGenMode(mode) {
    if (!mode) return; // safety

    // Update hidden input
    document.getElementById('gen_mode').value = mode;

    // Update Tab Styles
    document.getElementById('tab-gen-gp').classList.toggle('active', mode === 'grandparents');
    document.getElementById('tab-gen-match').classList.toggle('active', mode === 'matching');

    const gpDiv = document.getElementById('gen-input-grandparents');
    const matchDiv = document.getElementById('gen-input-matching');
    const gpLabel = document.getElementById('gen-label-gp');
    const matchLabel = document.getElementById('gen-label-match');

    // Description is now inside the div, so it toggles automatically with the div.
    // We just need to ensure the Labels for "Parents" vs "Grandparents" toggle if they are separate.

    if (mode === 'matching') {
        gpDiv.style.display = 'none';
        matchDiv.style.display = 'block';
        gpLabel.style.display = 'none';
        matchLabel.style.display = 'inline';
        if (document.getElementById('gen-note-gp')) document.getElementById('gen-note-gp').style.display = 'none';
    } else {
        gpDiv.style.display = 'block';
        matchDiv.style.display = 'none';
        gpLabel.style.display = 'inline';
        matchLabel.style.display = 'none';
        if (document.getElementById('gen-note-gp')) document.getElementById('gen-note-gp').style.display = 'block';
    }
    // Clear results when switching
    document.getElementById('gen-results').innerHTML = '';
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

    const captureId = `capture-${containerId}`;
    container.innerHTML = `
        <div id="${captureId}" class="result-card-2x3">
            <div class="result-header">
                ${combo.child != null ? `<div style="margin-bottom:5px; font-size:0.9rem; color:#ccc; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span>育成モンスター:</span>
                    <img src="images/${MONSTER_NAMES[combo.child]}.png" style="width:24px; height:24px; border-radius:4px; vertical-align:middle;">
                    <span>${MONSTER_NAMES[combo.child]}</span>
                </div>` : ''}
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
        <div style="text-align:right; margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="mini-action-btn" 
                onclick='applyToTyrant(${JSON.stringify(combo)}, ${JSON.stringify(items || {})})'>
                タイラントツールへ適用
            </button>
            <button class="save-img-btn" style="margin-top:0;" onclick="saveAsImage('${captureId}', 'opt_result')">📷 画像を保存</button>
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
    // Add "Empty" option first
    const emptyOption = `
        <div class="modal-item" onclick="selectMonster(null)" style="background:#444; border:1px dashed #777;">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
                <span style="font-size:1.5rem; color:#aaa;">X</span>
                <span style="font-size:0.7rem;">空欄に戻す</span>
            </div>
        </div>
    `;

    const monsterOptions = MONSTER_NAMES.map((name, idx) => `
        <div class="modal-item" onclick="selectMonster(${idx})">
            <div>
                <img src="images/${name}.png" alt="${name}" style="width:32px; height:32px; display:block; margin:0 auto;"><br>
                ${name}
            </div>
        </div>
    `).join('');

    grid.innerHTML = emptyOption + monsterOptions;
}

// --- Image Saving ---
function saveAsImage(elementId, fileName) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Temporarily hide buttons inside the element from screenshot? 
    // Or just let them be visible. User might want to see them.
    // Spec says "capture result". Usually buttons are excluded, but let's keep it simple first.
    // If we want to exclude, we can use 'ignoreElements' callback.

    // Use CORS and allowTaint to try and fix "security error" or missing images
    // Also use logging to see what happens
    html2canvas(element, {
        backgroundColor: "#1e1e1e", // Match card-bg or bg-color
        scale: 2, // High res
        useCORS: true,
        logging: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }).catch(err => {
        console.error("Image save failed:", err);
        alert("画像の保存に失敗しました: " + err.message);
    });
}

function renderResults(containerId, list, context) {
    const container = document.getElementById(containerId);

    // KEY FIX: The container usually has 'result-grid' class which breaks layout if we add children directly.
    // We remove it from the parent and put it on the inner wrapper.
    container.classList.remove('result-grid');

    let headerHTML = '';
    if (context) {
        headerHTML = `
        <div style="margin-bottom:15px; padding:5px;">
             <div class="result-card-2x3">
                <div class="result-header">設定 (共通秘伝Ⅲ:${context.s3}　共通秘伝Ⅱ:${context.s2}　ノーブル:${context.noble})</div>
                <div class="result-parents-grid">
                    <div class="parent-label">父親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.f]}.png" onerror="this.src=''"><div>父<br>${MONSTER_NAMES[context.f]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.ff]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[context.ff]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.fm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[context.fm]}</div></div>
                </div>
                <div class="result-parents-grid">
                    <div class="parent-label">母親側</div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.m]}.png" onerror="this.src=''"><div>母<br>${MONSTER_NAMES[context.m]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.mf]}.png" onerror="this.src=''"><div>祖父<br>${MONSTER_NAMES[context.mf]}</div></div>
                    <div class="mini-card"><img src="images/${MONSTER_NAMES[context.mm]}.png" onerror="this.src=''"><div>祖母<br>${MONSTER_NAMES[context.mm]}</div></div>
                </div>
            </div>
        </div>`;
    }

    let html = list.map(item => `
        <div class="result-card">
            <img src="images/${item.name}.png" onerror="this.src=''">
            <div>${item.name}</div>
            <div class="result-score">${item.score.toFixed(1)}</div>
            <div class="result-symbol">${item.symbol}</div>
        </div>
    `).join('');

    // Wrap in a capture div (which will have the grid layout) + button
    container.innerHTML = `
        <div id="capture-${containerId}" style="padding:10px; background:#121212;">
            ${headerHTML}
            <div class="result-grid" style="margin-top:0;">${html}</div>
        </div>
        <div style="text-align:center; margin-top:15px;">
            <button class="save-img-btn" onclick="saveAsImage('capture-${containerId}', 'gift_result')">📷 画像を保存</button>
        </div>
    `;
}

// --- Target Bloodline Logic ---

function toggleTargetMode() {
    const radios = document.getElementsByName('target_mode');
    for (let r of radios) {
        if (r.checked) {
            searchTargetMode = r.value;
            break;
        }
    }
    const selectorArea = document.getElementById('target-selector-area');
    if (searchTargetMode === 'designated') {
        selectorArea.style.display = 'block';
        updateTargetCount();
    } else {
        selectorArea.style.display = 'none';
    }
}

function openBloodlineModal() {
    renderBloodlineModal();
    document.getElementById('bloodline-modal').classList.add('open');
}

function closeBloodlineModal() {
    document.getElementById('bloodline-modal').classList.remove('open');
    updateTargetCount();
}

function toggleTarget(idx) {
    if (targetBloodlines.has(idx)) {
        targetBloodlines.delete(idx);
    } else {
        targetBloodlines.add(idx);
    }
    renderBloodlineModal(); // re-render to update styles
    updateTargetCount();
}

function selectAllTargets() {
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        targetBloodlines.add(i);
    }
    renderBloodlineModal();
    updateTargetCount();
}

function clearAllTargets() {
    targetBloodlines.clear();
    renderBloodlineModal();
    updateTargetCount();
}

// Group definitions
const GROUP_INDICES = {
    'inorganic': [20, 31, 11, 4, 3],
    'creation': [12, 9, 27, 29],
    'phantom': [32, 19, 14, 25, 18, 17],
    'demon': [1, 22, 26, 13, 16, 0],
    'beast': [24, 7, 8, 10, 5, 2],
    'monster': [28, 30, 21, 23, 6, 15]
};

function selectGroup(groupKey) {
    const indices = GROUP_INDICES[groupKey];
    if (!indices) return;

    // logic: Add all.
    for (let idx of indices) {
        targetBloodlines.add(idx);
    }
    renderBloodlineModal();
    updateTargetCount();
}

function renderBloodlineModal() {
    const grid = document.getElementById('target-grid');
    grid.innerHTML = '';

    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        const div = document.createElement('div');
        div.className = 'modal-item';
        // highlight if selected
        if (targetBloodlines.has(i)) {
            div.style.border = "2px solid var(--accent-color)";
            div.style.background = "#333";
        }

        div.onclick = () => toggleTarget(i);
        div.innerHTML = `
            <img src="images/${MONSTER_NAMES[i]}.png" style="width:30px;height:30px;display:block;margin-bottom:2px;">
            <div>${MONSTER_NAMES[i]}</div>
        `;
        grid.appendChild(div);
    }

    document.getElementById('target-count').innerText = `${targetBloodlines.size}体 選択中`;
}

function updateTargetCount() {
    // Updates the count on the main screen button
    const btnCount = document.getElementById('target-btn-count');
    if (btnCount) btnCount.innerText = `(${targetBloodlines.size})`;

    // Check Icons Preview
    const previewContainer = document.getElementById('target-icons-preview');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        targetBloodlines.forEach(idx => {
            const img = document.createElement('img');
            img.src = `images/${MONSTER_NAMES[idx]}.png`;
            img.style.width = '30px';
            img.style.height = '30px';
            img.style.borderRadius = '4px';
            img.style.border = '1px solid #555';
            img.title = MONSTER_NAMES[idx];
            previewContainer.appendChild(img);
        });
    }
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

function applyToTyrant(combo, items) {
    if (!combo) return;

    // 1. Set Tyrant Feature State
    selectedMonsters.gf_f = combo.f;
    selectedMonsters.gf_ff = combo.ff;
    selectedMonsters.gf_fm = combo.fm;
    selectedMonsters.gf_m = combo.m;
    selectedMonsters.gf_mf = combo.mf;
    selectedMonsters.gf_mm = combo.mm;

    // 2. Set Items if present
    if (items) {
        document.getElementById('secret3').value = items.s3 || 0;
        document.getElementById('secret2').value = items.s2 || 0;
        document.getElementById('noble').value = items.noble || 0;
    } else {
        document.getElementById('secret3').value = 0;
        document.getElementById('secret2').value = 0;
        document.getElementById('noble').value = 0;
    }

    // 3. Update UI
    saveToLocalStorage();
    updateAllPlaceholders();
    syncSliderLabels();

    // 4. Switch Tab
    const giftTab = document.querySelector('a[onclick*="tab-gift"]');
    if (giftTab) giftTab.click();

    // 5. Scroll & Run
    setTimeout(() => {
        const tyrantArea = document.getElementById('tyrant-calc');
        if (tyrantArea) tyrantArea.scrollIntoView({ behavior: 'smooth' });

        // Auto-run calculation
        runGiftSearch();
    }, 300);
}

// --- Top 10 & Tab Helpers ---

function calculateItemsForScore(currentScore, targetScore) {
    if (targetScore === 999 || currentScore >= targetScore) {
        return { s3: 0, s2: 0, noble: 0, totalScore: currentScore };
    }
    let diff = targetScore - currentScore;
    let s3Part = diff * (12 / 25);
    let s2Part = diff * (1 / 25);
    let n3 = Math.round(s3Part / 12.5);
    let n2 = Math.round(s2Part / 5);

    // Optimization to reduce items if possible (consistent with existing logic)
    let currentCover = (n3 * 12.5) + (n2 * 5);
    let remainder = diff - currentCover;
    let nn = Math.ceil(remainder);
    if (nn < 0) nn = 0;
    if ((n3 * 12.5) + (n2 * 5) + nn < diff) {
        nn = Math.ceil(diff - ((n3 * 12.5) + (n2 * 5)));
    }
    return {
        s3: n3, s2: n2, noble: nn,
        totalScore: currentScore + (n3 * 12.5) + (n2 * 5) + nn
    };
}

window.showResultTab = function (containerId, tabName) {
    const bestDiv = document.getElementById(`${containerId}-best`);
    const top10Div = document.getElementById(`${containerId}-top10`);
    if (bestDiv) bestDiv.style.display = 'none';
    if (top10Div) top10Div.style.display = 'none';

    const tabs = document.querySelectorAll(`#${containerId}-tabs .sub-tab`);
    tabs.forEach(t => t.classList.remove('active'));

    const targetDiv = document.getElementById(`${containerId}-${tabName}`);
    if (targetDiv) targetDiv.style.display = 'block';

    const activeTab = document.querySelector(`#${containerId}-tabs .sub-tab[onclick*="'${tabName}'"]`);
    if (activeTab) activeTab.classList.add('active');
}

function generate2x3HTML(containerId, combo, finalScore, items) {
    let itemsHTML = '';
    // Normalize items object structure (remove totalScore or keep it, doesn't matter)
    // The items object usually has { s3, s2, noble }
    if (items && (items.s3 > 0 || items.s2 > 0 || items.noble > 0)) {
        itemsHTML = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #444; font-size:0.9rem; text-align:center;">
            <div>推奨共通秘伝数・加算値</div>
            <div style="color:var(--accent-color); font-weight:bold; margin-top:5px;">
                共通秘伝Ⅲ：${items.s3}個, 共通秘伝Ⅱ：${items.s2}個, ノーブル秘伝：${items.noble}
            </div>
        </div>`;
    }

    const captureId = `capture-${containerId}`; // Unique capture ID based on container
    // Note: If we use this for best result, it works.

    return `
        <div id="${captureId}" class="result-card-2x3">
            <div class="result-header">
                ${combo.child != null ? `<div style="margin-bottom:5px; font-size:0.9rem; color:#ccc; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span>育成モンスター:</span>
                    <img src="images/${MONSTER_NAMES[combo.child]}.png" style="width:24px; height:24px; border-radius:4px; vertical-align:middle;">
                    <span>${MONSTER_NAMES[combo.child]}</span>
                </div>` : ''}
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
        <div style="text-align:right; margin-top:10px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="mini-action-btn" 
                onclick='applyToTyrant(${JSON.stringify(combo)}, ${JSON.stringify(items || {})})'>
                タイラントツールへ適用
            </button>
            <button class="save-img-btn" style="margin-top:0;" onclick="saveAsImage('${captureId}', '${containerId}_result')">📷 画像を保存</button>
        </div>
    `;
}

function renderTabbedResults(containerId, topCombos, targetScore) {
    const container = document.getElementById(containerId);

    // Process Top 10
    const processed = topCombos.map(c => {
        const itemRes = calculateItemsForScore(c.rawScore, targetScore);
        // Clean items object for stringify
        const itemsClean = { s3: itemRes.s3, s2: itemRes.s2, noble: itemRes.noble };
        return { ...c, items: itemsClean, finalScore: itemRes.totalScore };
    });

    const best = processed[0];

    // Generate Best HTML
    const bestHTML = generate2x3HTML(containerId + '-best-card', best, best.finalScore, best.items);

    // Generate Top 10 List HTML
    const listHTML = processed.map((p, idx) => {
        return `
        <div class="result-card-2x3" style="margin-bottom:10px; border:1px solid #444; padding:10px;">
             <div class="result-header" style="border-bottom:none; padding-bottom:5px; margin-bottom:5px;">
                <span style="font-size:1.0rem; font-weight:bold; color:var(--accent-color); margin-right:10px;">TOP ${idx + 1}</span>
                ${getSymbol(p.finalScore)} ${p.finalScore.toFixed(1)}
             </div>
             
             <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.8rem; margin-bottom:10px;">
                 <div style="background:#222; padding:5px; border-radius:4px;">
                    <div style="color:#888; font-size:0.7rem;">父親側</div>
                    <div>父: ${MONSTER_NAMES[p.f]}</div>
                    <div style="font-size:0.7rem; color:#aaa;">(祖: ${MONSTER_NAMES[p.ff]}, ${MONSTER_NAMES[p.fm]})</div>
                 </div>
                 <div style="background:#222; padding:5px; border-radius:4px;">
                    <div style="color:#888; font-size:0.7rem;">母親側</div>
                    <div>母: ${MONSTER_NAMES[p.m]}</div>
                    <div style="font-size:0.7rem; color:#aaa;">(祖: ${MONSTER_NAMES[p.mf]}, ${MONSTER_NAMES[p.mm]})</div>
                 </div>
             </div>
             
             <div style="text-align:center;">
                  <button class="mini-action-btn" onclick='applyToTyrant(${JSON.stringify(p)}, ${JSON.stringify(p.items)})'>
                    タイラントツールへ適用
                  </button>
             </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div id="${containerId}-tabs" class="sub-tabs">
            <div class="sub-tab active" onclick="showResultTab('${containerId}', 'best')">最適となる組合せ</div>
            <div class="sub-tab" onclick="showResultTab('${containerId}', 'top10')">上位10件の組合せ</div>
        </div>
    `;
}

function renderTabbedResults(containerId, topCombos, targetScore) {
    const container = document.getElementById(containerId);

    // Process Top 10
    const processed = topCombos.map(c => {
        const itemRes = calculateItemsForScore(c.rawScore, targetScore);
        // Clean items object for stringify
        const itemsClean = { s3: itemRes.s3, s2: itemRes.s2, noble: itemRes.noble };
        return { ...c, items: itemsClean, finalScore: itemRes.totalScore };
    });

    const best = processed[0];

    // Generate Best HTML
    const bestHTML = generate2x3HTML(containerId + '-best-card', best, best.finalScore, best.items);

    // Generate Top 10 List HTML
    // Generate Top 10 List HTML
    const listHTML = processed.map((p, idx) => {
        let itemsHTML = '';
        if (p.items && (p.items.s3 > 0 || p.items.s2 > 0 || p.items.noble > 0)) {
            itemsHTML = `
            <div style="margin-top:5px; padding-top:5px; border-top:1px dashed #444; font-size:0.8rem; text-align:center;">
                <div style="color:#ccc;">推奨共通秘伝数・加算値</div>
                <div style="color:var(--accent-color); font-weight:bold;">
                    共通秘伝Ⅲ：${p.items.s3}個, 共通秘伝Ⅱ：${p.items.s2}個, ノーブル秘伝：${p.items.noble}
                </div>
            </div>`;
        }

        return `
        <div class="result-card-2x3" style="margin-bottom:10px; border:1px solid #444; padding:10px;">
             <div class="result-header" style="border-bottom:none; padding-bottom:5px; margin-bottom:5px;">
                <span style="font-size:1.0rem; font-weight:bold; color:var(--accent-color); margin-right:10px;">TOP ${idx + 1}</span>
                ${getSymbol(p.finalScore)} ${p.finalScore.toFixed(1)}
             </div>
             
             <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.8rem; margin-bottom:10px;">
                 <div style="background:#222; padding:5px; border-radius:4px;">
                    <div style="color:#888; font-size:0.7rem;">父親側</div>
                    <div>父: ${MONSTER_NAMES[p.f]}</div>
                    <div style="font-size:0.7rem; color:#aaa;">(祖: ${MONSTER_NAMES[p.ff]}, ${MONSTER_NAMES[p.fm]})</div>
                 </div>
                 <div style="background:#222; padding:5px; border-radius:4px;">
                    <div style="color:#888; font-size:0.7rem;">母親側</div>
                    <div>母: ${MONSTER_NAMES[p.m]}</div>
                    <div style="font-size:0.7rem; color:#aaa;">(祖: ${MONSTER_NAMES[p.mf]}, ${MONSTER_NAMES[p.mm]})</div>
                 </div>
             </div>
             
             ${itemsHTML}
             
             <div style="text-align:center; margin-top:10px;">
                  <button class="mini-action-btn" onclick='applyToTyrant(${JSON.stringify(p)}, ${JSON.stringify(p.items)})'>
                    タイラントツールへ適用
                  </button>
             </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div id="${containerId}-tabs" class="sub-tabs">
            <div class="sub-tab active" onclick="showResultTab('${containerId}', 'best')">最適となる組合せ</div>
            <div class="sub-tab" onclick="showResultTab('${containerId}', 'top10')">上位10件の組合せ</div>
        </div>
        <div id="${containerId}-best">${bestHTML}</div>
        <div id="${containerId}-top10" style="display:none;">${listHTML}</div>
    `;
}

// --- Data / Patching System ---

let ORIGINAL_MATRIX = null;
let patchData = {}; // Key: "childIdx-parentIdx", Value: diff (number)
let isPatchActive = true;
let isOverlayVisible = false;
let currentEditTarget = null; // {c, p}

function initPatchSystem() {
    // 1. Capture Original
    if (typeof structuredClone === 'function') {
        ORIGINAL_MATRIX = structuredClone(COMPATIBILITY_MATRIX);
    } else {
        // Fallback for older browsers
        ORIGINAL_MATRIX = JSON.parse(JSON.stringify(COMPATIBILITY_MATRIX));
    }

    // 2. Load Data
    const savedPatch = localStorage.getItem('mf_sim_patch_data');
    if (savedPatch) {
        try { patchData = JSON.parse(savedPatch); } catch (e) { console.error(e); }
    }

    const savedOverlay = localStorage.getItem('mf_sim_overlay_visible');
    if (savedOverlay) {
        isOverlayVisible = (savedOverlay === 'true');
    }

    // 3. Apply Patch
    // Default Active on load? Yes "Auto load last applied..." implies active.
    applyPatchToMatrix();

    // 4. Update UI
    document.getElementById('overlay-toggle').checked = isOverlayVisible;
    updateOverlayUI();
    renderMatrix();
}

function applyPatchToMatrix() {
    // Reset to Original
    for (let i = 0; i < MONSTER_NAMES.length; i++) {
        for (let j = 0; j < MONSTER_NAMES.length; j++) {
            COMPATIBILITY_MATRIX[i][j] = ORIGINAL_MATRIX[i][j];
        }
    }

    const body = document.body;
    const statusText = document.getElementById('patch-status-text');
    const toggleBtn = document.getElementById('patch-toggle-btn');

    if (isPatchActive) {
        // Apply Diffs
        for (let key in patchData) {
            const [c, p] = key.split('-').map(Number);
            const diff = patchData[key];
            if (!Number.isNaN(c) && !Number.isNaN(p)) {
                COMPATIBILITY_MATRIX[c][p] += diff;
            }
        }
        body.classList.add('patch-active');
        if (statusText) statusText.innerText = "パッチ適用中";
        if (statusText) statusText.style.color = "var(--accent-color)";
        if (toggleBtn) toggleBtn.classList.add('on');
    } else {
        body.classList.remove('patch-active');
        if (statusText) statusText.innerText = "パッチOFF";
        if (statusText) statusText.style.color = "#aaa";
        if (toggleBtn) toggleBtn.classList.remove('on');
    }

    // Update Matrix View if visible?
    // Optimization: only if data tab is active? 
    // Just render it.
    const matrixTable = document.getElementById('matrix-table');
    if (matrixTable && matrixTable.offsetParent !== null) {
        renderMatrix();
    }
}

function togglePatchActive() {
    isPatchActive = !isPatchActive;
    applyPatchToMatrix();
}

function toggleOverlaySetting() {
    const cb = document.getElementById('overlay-toggle');
    isOverlayVisible = cb.checked;
    localStorage.setItem('mf_sim_overlay_visible', isOverlayVisible);
    updateOverlayUI();
}

function updateOverlayUI() {
    const overlay = document.getElementById('patch-overlay');
    if (isOverlayVisible) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function renderMatrix() {
    const table = document.getElementById('matrix-table');
    if (!table) return;

    // Header
    let html = '<thead><tr><th class="corner">子\\親</th>';
    MONSTER_NAMES.forEach(name => {
        html += `<th><img src="images/${name}.png" style="width:20px;"></th>`;
    });
    html += '</tr></thead><tbody>';

    // Body
    MONSTER_NAMES.forEach((childName, cIdx) => {
        html += `<tr>`;
        // Row Header
        html += `<th class="row-header"><img src="images/${childName}.png" style="width:20px;"></th>`;

        MONSTER_NAMES.forEach((parentName, pIdx) => {
            const currentVal = COMPATIBILITY_MATRIX[cIdx][pIdx];
            const originalVal = ORIGINAL_MATRIX[cIdx][pIdx];
            const diff = currentVal - originalVal;

            // Diff display
            let diffHTML = '';
            // Only show diff if patch is active AND there is a diff
            if (isPatchActive && diff !== 0) {
                const sign = diff > 0 ? '+' : '';
                const cls = diff < 0 ? 'neg' : '';
                diffHTML = `<span class="diff-val ${cls}">(${sign}${diff})</span>`;
            } else if (patchData[`${cIdx}-${pIdx}`] && !isPatchActive) {
                // Show that a patch exists but inactive? (Optional)
                // User asked: "view change amount... (0) -> +n"
                // Let's stick to current active value state.
            }

            // Cell color?
            // User requested: "視覚的にわかりやすく" (visually clear)
            // Maybe colorize based on value?
            // High value = Gold/Yellow?
            let bgStyle = '';
            if (currentVal >= 30) bgStyle = 'background:rgba(255,215,0, 0.1);';
            if (currentVal >= 35) bgStyle = 'background:rgba(255,215,0, 0.2);';
            if (currentVal < 20) bgStyle = 'background:rgba(255,0,0, 0.1);';

            html += `<td class="matrix-cell" style="${bgStyle}" onclick="openEditModal(${cIdx}, ${pIdx})">
                ${currentVal}
                ${diffHTML}
            </td>`;
        });
        html += `</tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;
}

// --- Edit Logic ---

function openEditModal(c, p) {
    currentEditTarget = { c, p };
    const currentVal = COMPATIBILITY_MATRIX[c][p];

    document.getElementById('edit-target-label').innerText = `${MONSTER_NAMES[c]} (子) × ${MONSTER_NAMES[p]} (親)`;
    document.getElementById('edit-child-img').src = `images/${MONSTER_NAMES[c]}.png`;
    document.getElementById('edit-parent-img').src = `images/${MONSTER_NAMES[p]}.png`;

    document.getElementById('edit-val-input').value = currentVal;

    document.getElementById('edit-value-modal').classList.add('open');
}

function closeEditModal() {
    document.getElementById('edit-value-modal').classList.remove('open');
    currentEditTarget = null;
}

function confirmEditValue() {
    if (!currentEditTarget) return;
    const { c, p } = currentEditTarget;
    const inputVal = Number(document.getElementById('edit-val-input').value);

    // Calculate Diff relative to ORIGINAL
    const originalVal = ORIGINAL_MATRIX[c][p];
    const diff = inputVal - originalVal;

    const key = `${c}-${p}`;
    if (diff === 0) {
        delete patchData[key];
    } else {
        patchData[key] = diff;
    }

    // Save
    localStorage.setItem('mf_sim_patch_data', JSON.stringify(patchData));

    // Apply (If patch mode is inactive, should we activate it? probably yes to see result)
    if (!isPatchActive) {
        isPatchActive = true;
        togglePatchActive(); // This calls apply
    } else {
        applyPatchToMatrix();
    }

    closeEditModal();
}

function resetEditValue() {
    if (!currentEditTarget) return;
    const { c, p } = currentEditTarget;
    document.getElementById('edit-val-input').value = ORIGINAL_MATRIX[c][p];
}

function resetPatch() {
    if (!confirm("現在のパッチを全てリセットし、元の数値に戻しますか？")) return;
    patchData = {};
    localStorage.removeItem('mf_sim_patch_data');
    applyPatchToMatrix();
}

// --- Export / Import ---

function exportPatch() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(patchData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mf_sim_patch.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function triggerImport() {
    // handled by label wrapping or onclick delegation in HTML, 
    // but here we just ensure input is clicked (handled by CSS positioning in button usually)
    // In HTML I put input inside button.
}

function importPatch(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (typeof imported === 'object') {
                patchData = imported;
                localStorage.setItem('mf_sim_patch_data', JSON.stringify(patchData));
                applyPatchToMatrix();
                alert("パッチを読み込みました");
            }
        } catch (err) {
            console.error(err);
            alert("読み込みエラー: " + err.message);
        }
    };
    reader.readAsText(file);
    inputElement.value = ''; // Reset
}
