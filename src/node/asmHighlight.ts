const REGISTERS = new Set([
    "rax","rbx","rcx","rdx","rsi","rdi","rsp","rbp",
    "r8","r9","r10","r11","r12","r13","r14","r15",
    "r8d","r9d","r10d","r11d","r12d","r13d","r14d","r15d",
    "r8w","r9w","r10w","r11w","r12w","r13w","r14w","r15w",
    "r8b","r9b","r10b","r11b","r12b","r13b","r14b","r15b",
    "eax","ebx","ecx","edx","esi","edi","esp","ebp",
    "ax","bx","cx","dx","si","di","sp","bp",
    "al","bl","cl","dl","ah","bh","ch","dh",
    "sil","dil","spl","bpl",
    "xmm0","xmm1","xmm2","xmm3","xmm4","xmm5","xmm6","xmm7",
    "xmm8","xmm9","xmm10","xmm11","xmm12","xmm13","xmm14","xmm15",
    "ymm0","ymm1","ymm2","ymm3","ymm4","ymm5","ymm6","ymm7",
    "rip","eip","rflags","eflags","rsp",
    "cs","ds","es","fs","gs","ss",
    "st","st0","st1","st2","st3","st4","st5","st6","st7",
    "mm0","mm1","mm2","mm3","mm4","mm5","mm6","mm7",
    "cr0","cr2","cr3","cr4","dr0","dr1","dr2","dr3","dr6","dr7",
]);

const SIZE_QUALS = new Set([
    "byte","word","dword","qword","tbyte","oword","yword","zword",
    "far","near","short","ptr",
]);

const C_MNEMONIC = "#f92672"; // pink  — keywords
const C_REGISTER = "#fd971f"; // orange — variables
const C_NUMBER   = "#ae81ff"; // purple — literals
const C_SIZE     = "#66d9ef"; // cyan   — types
const C_PUNCT    = "#f8f8f2"; // white  — everything else

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Returns an HTML string with Monokai-coloured x86 assembly instruction. */
export function highlightAsm(opcode: string): string {
    // Tokenise: hex numbers | decimal numbers | identifiers | whitespace | any char
    const re = /0x[0-9a-f]+|[0-9]+|[a-z_][a-z0-9_]*|\s+|./gsi;
    const tokens = [...opcode.matchAll(re)].map(m => m[0]);

    let html = "";
    let mnemonicDone = false;

    for (const tok of tokens) {
        // Preserve whitespace unchanged
        if (/^\s+$/.test(tok)) {
            html += tok;
            continue;
        }

        // First non-whitespace token is always the mnemonic
        if (!mnemonicDone) {
            html += `<span style="color:${C_MNEMONIC}">${esc(tok)}</span>`;
            mnemonicDone = true;
            continue;
        }

        const low = tok.toLowerCase();

        if (/^0x[0-9a-f]+$/i.test(tok) || /^[0-9]+$/.test(tok)) {
            html += `<span style="color:${C_NUMBER}">${esc(tok)}</span>`;
        } else if (REGISTERS.has(low)) {
            html += `<span style="color:${C_REGISTER}">${esc(tok)}</span>`;
        } else if (SIZE_QUALS.has(low)) {
            html += `<span style="color:${C_SIZE}">${esc(tok)}</span>`;
        } else {
            html += `<span style="color:${C_PUNCT}">${esc(tok)}</span>`;
        }
    }

    return html;
}
