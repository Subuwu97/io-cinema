// ASS effect generators can leave nested/unbalanced comments in converted VTT.
// Treat their contents as metadata, never as readable dialogue.
function cleanSubtitleLine(value) {
  let depth = 0, plain = '';
  for (const ch of String(value)) {
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { if (depth) depth--; continue; }
    if (!depth) plain += ch;
  }
  plain = plain.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ');
  // Orphaned override commands have already lost their braces during conversion.
  // Drop the effect line instead of trying to interpret arbitrary drawing syntax.
  if (/\\(?:an?|move|pos|org|fsc[xy]|fs|blur|bord|shad|fad|fade|[1-4]?[ac]|[1-4]vc|t|p|clip|iclip|fr[xyz]?|k[fo]?)(?:[(&\d-]|\s|$)/i.test(plain)) return '';
  return plain.replace(/<\/?font[^>]*>/gi, '').replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[^\S\n]+/g, ' ').trim()).join('\n').trim();
}
function stripDrawingCommands(line) {
  const words = line.split(/\s+/);
  const isNumber = (w) => /^-?\d+(\.\d+)?$/.test(w);
  const isCmdLetter = (w) => /^[mnlbspc]$/i.test(w);
  const keep = new Array(words.length).fill(true);
  let i = 0;
  while (i < words.length) {
    if (isCmdLetter(words[i])) {
      const groupStart = i;
      let groupCount = 0;
      let j = i;
      while (j < words.length && isCmdLetter(words[j])) {
        let k = j + 1;
        let numCount = 0;
        while (k < words.length && isNumber(words[k])) { numCount++; k++; }
        if (numCount < 2) break; // not a valid drawing command (needs at least one coordinate pair)
        groupCount++;
        j = k;
      }
      if (groupCount >= 2) {
        for (let x = groupStart; x < j; x++) keep[x] = false;
        i = j;
        continue;
      }
    }
    i++;
  }
  return words.filter((w, idx) => keep[idx]).join(' ');
}

function sanitizeVttText(vtt) {
  const blocks = String(vtt).split(/\r?\n\r?\n/);
  const kept = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) { kept.push(block); continue; } // header/notes untouched
    const head = lines.slice(0, timingIdx + 1);
    const payload = lines.slice(timingIdx + 1)
      .map((l) => cleanSubtitleLine(l).split('\n').map(stripDrawingCommands).filter(line => line.length > 0).join('\n'))
      .filter((l) => l.length > 0);
    if (payload.length === 0) continue; // pure-styling/pure-drawing cue - drop it
    kept.push([...head, ...payload].join('\n'));
  }
  return kept.join('\n\n') + '\n';
}

module.exports = { cleanSubtitleLine, sanitizeVttText };
