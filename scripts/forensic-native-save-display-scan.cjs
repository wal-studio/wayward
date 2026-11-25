'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = 'Wayward_WML_ko.html';
const html = fs.readFileSync(file, 'utf8');
const terms = ['nativeSaveJSON','nativeSave','saveJSON','saveGame','saveSlot','localStorage','저장 목록','저장 슬롯','불러오기','세이브'];
const out = ['file=' + file,'bytes=' + Buffer.byteLength(html, 'utf8'),'sha256=' + crypto.createHash('sha256').update(html).digest('hex')];
for (const term of terms) {
 let from=0,count=0;
 while(count<40){const at=html.indexOf(term,from);if(at<0)break;out.push('\\n===== '+term+' @ '+at+' =====');out.push(html.slice(Math.max(0,at-1400),Math.min(html.length,at+2600)));from=at+term.length;count++;}
 out.push('count('+term+')='+count+(count===40?'+ (capped)':''));
}
fs.mkdirSync('forensic-output',{recursive:true});
fs.writeFileSync('forensic-output/native-save-display-scan.txt',out.join('\\n'),'utf8');
console.log(out.slice(0,12).join('\\n'));
