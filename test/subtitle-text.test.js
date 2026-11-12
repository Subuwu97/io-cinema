const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanSubtitleLine: clean } = require('../server/subtitle-text');
test('generated karaoke comments and orphaned ASS commands never become dialogue', () => {
  assert.equal(clean('{Kara Effector 3.5 {\\an5\\move(1,2,3,4)}\\p1}m 0 0'), 'm 0 0');
  assert.equal(clean('{Kara Effector 3.5 {\\an5}broken'), '');
  assert.equal(clean('\\an5\\move(1410,72,1430,-40)\\fscx15\\p1 m 0 0'), '');
  assert.equal(clean('{\\an8}{\\kf20}Keep {\\i1}these lyrics{\\i0}'), 'Keep these lyrics');
  assert.equal(clean('Normal dialogue, 123 and C:\\Users'), 'Normal dialogue, 123 and C:\\Users');
});


test('styled signs and lyrics retain hard, soft and physical line breaks', () => {
  const nl=String.fromCharCode(10);
  assert.equal(clean(String.raw`{\an8}First sign\NSecond sign`), ['First sign','Second sign'].join(nl));
  assert.equal(clean(String.raw`Romanized lyrics\nEnglish translation`), ['Romanized lyrics','English translation'].join(nl));
  assert.equal(clean(['  First line  ','  Second line  '].join(nl)), ['First line','Second line'].join(nl));
});

test('VTT sanitation retains multiline signs, timing settings and simultaneous lyric cues', () => {
  const {sanitizeVttText}=require('../server/subtitle-text'),nl=String.fromCharCode(10);
  const input=['WEBVTT','','sign','00:01.000 --> 00:04.000 line:10% align:center',String.raw`{\an8}Station\NPlatform 2`,'','lyrics','00:01.000 --> 00:04.000',String.raw`{\k20}First lyric`,'Second lyric',''].join(nl);
  const output=sanitizeVttText(input);
  assert.ok(output.includes(['sign','00:01.000 --> 00:04.000 line:10% align:center','Station','Platform 2'].join(nl)));
  assert.ok(output.includes(['lyrics','00:01.000 --> 00:04.000','First lyric','Second lyric'].join(nl)));
  assert.equal((output.match(/-->/g)||[]).length,2);
  assert.ok(!output.includes(String.raw`\an8`));
});
