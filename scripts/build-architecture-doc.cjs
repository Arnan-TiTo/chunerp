/*
 * ประกอบไฟล์เอกสาร Word (.html) — เปิดด้วย Microsoft Word ได้ตรง ๆ
 *
 * ข้อจำกัดที่ทดสอบมาแล้วกับ Word 16 และเป็นเหตุผลของทุกทางเลือกในไฟล์นี้:
 *   • inline SVG  → Word ทิ้งทั้งภาพ ห้ามใช้
 *   • PNG data URI → ขึ้นครบ ใช้ฝังไดอะแกรม
 *   • ตาราง + เส้นขอบ → ขึ้นครบ ใช้จัดเลย์เอาต์ทุกอย่าง (flex/grid ถูกละเลย)
 */
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.resolve(process.argv[2])
const DEST = path.resolve(process.argv[3])

/** อ่านความกว้าง/สูงจากส่วนหัว PNG เพื่อคำนวณขนาดที่จะแสดงในหน้า A4 */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function image(file, displayWidth) {
  const buf = fs.readFileSync(path.join(SRC, file))
  const { w, h } = pngSize(buf)
  const height = Math.round((displayWidth * h) / w)
  return `<img src="data:image/png;base64,${buf.toString('base64')}" width="${displayWidth}" height="${height}" alt="">`
}

const deploy = image('diagram-deploy.png', 640)
const software = image('diagram-software.png', 640)

const css = `
@page WordSection1 { size: 21cm 29.7cm; margin: 2cm 2cm 2cm 2cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: "TH Sarabun New", "Sarabun", "Tahoma", sans-serif; font-size: 16pt; color: #22302a; line-height: 1.25; }
h1 { font-size: 26pt; color: #1c3d2d; margin: 0 0 6pt; }
h2 { font-size: 19pt; color: #2a5340; margin: 20pt 0 6pt; border-bottom: 1pt solid #cfd8ca; padding-bottom: 3pt; }
h3 { font-size: 17pt; color: #2a5340; margin: 14pt 0 4pt; }
p  { margin: 0 0 8pt; }
.lead { color: #52625a; }
.small { font-size: 14pt; color: #52625a; }
table { border-collapse: collapse; width: 100%; font-size: 14pt; margin: 6pt 0 10pt; }
th, td { border: 0.75pt solid #b9c8b6; padding: 4pt 7pt; vertical-align: top; }
th { background: #e4ece7; color: #1c3d2d; text-align: left; font-size: 14pt; }
td.n { text-align: right; }
tr.total td { background: #eef2ec; font-weight: bold; }
.figcap { font-size: 13pt; color: #7d8d84; margin: 3pt 0 12pt; }
.note { border: 0.75pt solid #b9c8b6; border-left: 3pt solid #a8763f; background: #faf7f2; padding: 7pt 10pt; margin: 8pt 0 12pt; font-size: 14pt; }
.note-risk { border-left-color: #9a4234; background: #faf2f0; }
.note-ok { border-left-color: #6e8b54; background: #f3f7f0; }
.cover { border: 1pt solid #2a5340; padding: 14pt 16pt; margin-bottom: 14pt; }
ul { margin: 0 0 10pt 0; padding-left: 20pt; }
li { margin-bottom: 4pt; }
`

const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<title>ChunERP — สเปกเซิร์ฟเวอร์และผังสถาปัตยกรรมระบบ</title>
<style>${css}</style>
</head>
<body lang="TH">
<div class="WordSection1">

<div class="cover">
  <p class="small" style="margin-bottom:2pt">ไร่กำนันจุล · บริษัท จุลไหมไทย จำกัด</p>
  <h1>สเปกเซิร์ฟเวอร์และผังสถาปัตยกรรมระบบ ChunERP</h1>
  <p class="lead" style="margin-bottom:10pt">
    เอกสารสำหรับขอใบเสนอราคาและวางแผนติดตั้ง ระบบรับซื้อรังไหมสดและงานส่งเสริมเกษตรกร
    รองรับผู้ใช้พร้อมกัน 100 คน 4 สาขา
  </p>
  <table style="width:auto;font-size:14pt">
    <tr><td style="border:none;padding:1pt 14pt 1pt 0"><b>ผู้ใช้พร้อมกัน</b></td><td style="border:none;padding:1pt 0">100 คน</td></tr>
    <tr><td style="border:none;padding:1pt 14pt 1pt 0"><b>สาขา</b></td><td style="border:none;padding:1pt 0">4 แห่ง — กำแพงเพชร นครไทย เพชรบูรณ์ เลย</td></tr>
    <tr><td style="border:none;padding:1pt 14pt 1pt 0"><b>ฐานข้อมูล</b></td><td style="border:none;padding:1pt 0">PostgreSQL 34 ตาราง</td></tr>
    <tr><td style="border:none;padding:1pt 14pt 1pt 0"><b>ระบบที่ต้องเชื่อม</b></td><td style="border:none;padding:1pt 0">Floor Weight Cocoon (MSSQL) · BPlus (บัญชี)</td></tr>
    <tr><td style="border:none;padding:1pt 14pt 1pt 0"><b>สถานะเอกสาร</b></td><td style="border:none;padding:1pt 0">ร่างเพื่อขอราคา · 8 กันยายน 2569</td></tr>
  </table>
</div>

<h2>1. ผังสถาปัตยกรรมระบบ (Architecture Diagram)</h2>
<p class="lead">เซิร์ฟเวอร์ต้องอยู่ในองค์กร เพราะระบบชั่งน้ำหนักและระบบบัญชี BPlus อยู่ในวง LAN ทั้งคู่</p>
<div class="note note-ok">
  <b>หลักที่ยึดในผังนี้</b> — ทุกการคำนวณเงินเกิดที่ API ไม่ใช่ที่หน้าจอ และ API เป็นตัวเดียวที่คุยกับ
  ระบบภายนอก หน้าเว็บไม่เคยต่อฐานข้อมูลใดโดยตรง เครื่องลูกข่ายจึงไม่ต้องมีสิทธิ์ในฐานข้อมูลเลย
</div>
<p style="page-break-before:always;margin:0"></p>
${deploy}
<p class="figcap">ภาพที่ 1 — ผังการติดตั้งฮาร์ดแวร์ จากสาขาถึงห้องเซิร์ฟเวอร์และระบบเดิมที่ต้องเชื่อม</p>

<h2>2. ผังการทำงานของซอฟต์แวร์</h2>
${software}
<p class="figcap">ภาพที่ 2 — ลำดับชั้นของระบบ และเส้นทางข้อมูลออกสู่ระบบภายนอก</p>

<br style="page-break-before:always">

<h2>3. โหลดที่ต้องรองรับจริง</h2>
<p class="lead">
  “100 คนพร้อมกัน” ไม่ได้แปลว่า 100 คำขอพร้อมกัน — หนึ่งคนกดปุ่มทุก 8–15 วินาที
  ระหว่างนั้นคือเวลาที่เขาชั่งของและคุยกับเกษตรกร
</p>
<table>
  <tr><th style="width:38%">รายการ</th><th style="width:22%">ค่าที่ใช้คำนวณ</th><th>ที่มา</th></tr>
  <tr><td><b>ผู้ใช้ออนไลน์พร้อมกัน</b></td><td class="n">100 คน</td><td>โจทย์ที่กำหนด</td></tr>
  <tr><td><b>คำขอต่อวินาที (เฉลี่ย)</b></td><td class="n">8–12 req/s</td><td>1 การกระทำต่อ 8–15 วินาที ต่อคน</td></tr>
  <tr><td><b>คำขอต่อวินาที (พีค)</b></td><td class="n">40–60 req/s</td><td>ช่วงเปิดคิวเช้า ทุกคนโหลดหน้าพร้อมกัน</td></tr>
  <tr><td><b>เขียนฐานข้อมูลต่อวัน</b></td><td class="n">~15,000 แถว</td><td>200 คิว × (ใบชั่ง + ถุงชั่ง ~30 + คุณภาพ + หนี้ + จ่ายเงิน)</td></tr>
  <tr><td><b>ฐานข้อมูลโตต่อปี</b></td><td class="n">3–6 GB</td><td>ธุรกรรม 3 ฤดูกาล + ประวัติการใช้งาน</td></tr>
  <tr><td><b>ไฟล์แนบต่อปี</b></td><td class="n">20–40 GB</td><td>รูปใบเสร็จค่าใช้จ่าย เฉลี่ย 1.5 MB ต่อใบ</td></tr>
  <tr><td><b>แบนด์วิดท์ต่อผู้ใช้</b></td><td class="n">2.1 MB ครั้งแรก</td><td>หลังจากนั้นน้อยกว่า 30 KB ต่อการกระทำ เพราะหน้าเว็บถูกแคช</td></tr>
</table>
<div class="note note-ok">
  <b>สรุป</b> — โหลดระดับนี้ไม่ต้องใช้เครื่องแรง ตัวจำกัดที่แท้จริงคือดิสก์ต้องเป็น NVMe
  (ฐานข้อมูลเขียนถี่ตอนชั่ง) และเครื่องต้องไม่ดับ งบส่วนใหญ่จึงควรลงกับความต่อเนื่อง
  ได้แก่ ไฟสำรอง ดิสก์ RAID และการสำรองข้อมูล มากกว่าลงกับจำนวนคอร์
</div>

<h2>4. เครื่องเซิร์ฟเวอร์ — สามทางเลือก</h2>
<p class="lead">ทั้งสามทางรองรับ 100 คนพร้อมกันได้หมด ต่างกันที่ว่าเครื่องพังแล้วระบบหยุดนานแค่ไหน</p>
<table>
  <tr>
    <th style="width:16%">ทางเลือก</th><th style="width:38%">สเปก</th>
    <th style="width:24%">งบประมาณ</th><th>เครื่องพังแล้ว</th>
  </tr>
  <tr>
    <td><b>ก (แนะนำ)</b><br><span class="small">เครื่องเดียว แบ่ง VM</span></td>
    <td>CPU 8 คอร์ 16 เธรด (Xeon E-2400 / EPYC 4004)<br>RAM 64 GB ECC<br>2 × 960 GB NVMe RAID1<br>2 × 4 TB SATA RAID1 (ไฟล์แนบ)<br>เพาเวอร์ 2 ตัวสำรองกันเอง</td>
    <td class="n">180,000 – 260,000 ฿</td>
    <td>หยุดจนกว่าจะกู้จาก NAS<br><span class="small">ประมาณ 2–4 ชั่วโมง</span></td>
  </tr>
  <tr>
    <td><b>ข</b><br><span class="small">สองเครื่อง แยกหน้าที่</span></td>
    <td>เครื่อง 1 (APP) 4 คอร์ / 16 GB<br>เครื่อง 2 (DB) 8 คอร์ / 64 GB<br>NVMe RAID1 ทั้งคู่<br>PostgreSQL streaming replica</td>
    <td class="n">280,000 – 380,000 ฿</td>
    <td>สลับไปเครื่องสำรอง<br><span class="small">ประมาณ 15 นาที</span></td>
  </tr>
  <tr>
    <td><b>ค</b><br><span class="small">คลาวด์ + VPN</span></td>
    <td>VM 4 vCPU / 16 GB / SSD 200 GB<br>Managed PostgreSQL 2 vCPU / 8 GB<br>VPN site-to-site กลับสำนักงานใหญ่</td>
    <td class="n">8,000 – 15,000 ฿/เดือน</td>
    <td>ผู้ให้บริการดูแลให้<br><span class="small">แต่เน็ตล่ม = ชั่งไม่ได้</span></td>
  </tr>
</table>
<div class="note note-risk">
  <b>ข้อควรระวังของทางเลือก ค</b> — จุดชั่งน้ำหนักต้องอ่านฐานข้อมูล MSSQL ของเครื่องชั่งซึ่งอยู่หน้างาน
  ถ้าเซิร์ฟเวอร์อยู่คลาวด์ ทุกครั้งที่ดึงน้ำหนักต้องวิ่งออกอินเทอร์เน็ตแล้ววิ่งกลับเข้ามา
  เน็ตสะดุดตอนคิวยาวคือคิวหยุดทั้งแถว
</div>

<br style="page-break-before:always">

<h2>5. ฮาร์ดแวร์ประจำสาขา</h2>
<p class="lead">จำนวนต่อ 1 สาขา — คูณ 4 สำหรับกำแพงเพชร นครไทย เพชรบูรณ์ และเลย</p>
<table>
  <tr><th style="width:24%">อุปกรณ์</th><th style="width:10%">จำนวน</th><th style="width:34%">สเปกขั้นต่ำ</th><th>ใช้ทำอะไร</th></tr>
  <tr><td><b>แท็บเล็ตจุดคัดแยก</b></td><td class="n">2</td><td>10–11 นิ้ว · RAM 4 GB · Wi-Fi · เคสกันกระแทก</td><td>ออกใบคิว บันทึกผลคัดแยกทีละถุง</td></tr>
  <tr><td><b>พีซีจุดชั่งน้ำหนัก</b></td><td class="n">1</td><td>i3/Ryzen 3 · RAM 8 GB · SSD 256 GB · มีพอร์ตต่อเครื่องชั่งเดิม</td><td>ดึงน้ำหนัก ล็อกใบชั่ง ปิดรายการรับซื้อ</td></tr>
  <tr><td><b>เครื่องพิมพ์ใบรับซื้อ</b></td><td class="n">1</td><td>เลเซอร์ขาวดำ A4 · ต่อเครือข่ายได้</td><td>ใบรับซื้อรังไหมสด 2 ชุด (เกษตรกร + บัญชี)</td></tr>
  <tr><td><b>เครื่องอ่าน QR</b></td><td class="n">1</td><td>2D imager แบบมีสาย</td><td>ฝ่ายบัญชีสแกนใบรับซื้อเพื่อเรียกเอกสาร</td></tr>
  <tr><td><b>พีซีสำนักงาน</b></td><td class="n">2–3</td><td>i3 · RAM 8 GB · จอ 24 นิ้ว</td><td>ทะเบียนเกษตรกร ใบจอง ตัดหนี้ จ่ายเงิน</td></tr>
  <tr><td><b>Wi-Fi Access Point</b></td><td class="n">2</td><td>Wi-Fi 6 · จ่ายไฟผ่านสาย LAN · ทนฝุ่น</td><td>คลุมลานรับซื้อและจุดคัดแยก</td></tr>
  <tr><td><b>สวิตช์ + เราเตอร์</b></td><td class="n">1 ชุด</td><td>สวิตช์ 8–16 พอร์ต PoE · เราเตอร์รองรับ VPN · ช่องใส่ซิม 4G สำรอง</td><td>เชื่อมสาขาเข้าสำนักงานใหญ่</td></tr>
  <tr><td><b>UPS ประจำจุดชั่ง</b></td><td class="n">1</td><td>1000–1500VA</td><td>ไฟดับกลางคิวแล้วใบชั่งไม่หาย</td></tr>
</table>

<h2>6. สำรองข้อมูลและความต่อเนื่อง</h2>
<table>
  <tr><th style="width:30%">เรื่อง</th><th style="width:22%">ข้อกำหนด</th><th>วิธีทำ</th></tr>
  <tr><td><b>ยอมให้ข้อมูลหายได้</b></td><td class="n">ไม่เกิน 15 นาที</td><td>PostgreSQL WAL archiving ส่งเข้า NAS ตลอดเวลา</td></tr>
  <tr><td><b>ยอมให้ระบบหยุดได้</b></td><td class="n">ไม่เกิน 4 ชั่วโมง</td><td>กู้จากสแนปช็อต VM (ทางเลือก ก) หรือสลับไป replica (ทางเลือก ข)</td></tr>
  <tr><td><b>สำรองเต็ม</b></td><td class="n">ทุกคืน 01:00</td><td>ดัมป์ฐานข้อมูลและไฟล์แนบลง NAS เก็บย้อนหลัง 30 วัน</td></tr>
  <tr><td><b>สำรองนอกสถานที่</b></td><td class="n">สัปดาห์ละครั้ง</td><td>ส่งขึ้นคลาวด์เก็บของ หรือฮาร์ดดิสก์ถอดออกเก็บนอกอาคาร</td></tr>
  <tr><td><b>ซ้อมกู้ระบบ</b></td><td class="n">ปีละ 2 ครั้ง</td><td>กู้ลงเครื่องทดสอบจริง — สำรองที่ไม่เคยกู้ ไม่นับว่ามีสำรอง</td></tr>
</table>
<div class="note note-risk">
  <b>ฤดูรับซื้อคือช่วงที่ห้ามหยุด</b> — คิวเกษตรกรรออยู่หน้าลาน ถ้าระบบล่มแล้วต้องรอ 4 ชั่วโมง
  แปลว่าเกษตรกรรอทั้งบ่าย ถ้ารับความเสี่ยงนี้ไม่ได้ ให้เลือกทางเลือก ข ตั้งแต่แรก
</div>

<br style="page-break-before:always">

<h2>7. ประมาณการงบทั้งโครงการ</h2>
<p class="lead">ตัวเลขสำหรับตั้งงบเบื้องต้น ยังไม่ใช่ราคาจากผู้ขาย</p>
<table>
  <tr><th style="width:52%">หมวด</th><th style="width:16%">จำนวน</th><th>ประมาณการ (บาท)</th></tr>
  <tr><td><b>เซิร์ฟเวอร์ + Hypervisor</b> <span class="small">(ทางเลือก ก)</span></td><td class="n">1 ชุด</td><td class="n">180,000 – 260,000</td></tr>
  <tr><td><b>NAS สำรองข้อมูล</b> <span class="small">8 TB RAID1</span></td><td class="n">1</td><td class="n">35,000 – 60,000</td></tr>
  <tr><td><b>UPS ห้องเซิร์ฟเวอร์</b> <span class="small">3000VA</span></td><td class="n">1</td><td class="n">25,000 – 45,000</td></tr>
  <tr><td><b>ไฟร์วอลล์ + VPN</b></td><td class="n">1</td><td class="n">30,000 – 70,000</td></tr>
  <tr><td><b>อุปกรณ์ประจำสาขา</b> <span class="small">(ตามข้อ 5)</span></td><td class="n">4 สาขา</td><td class="n">280,000 – 400,000</td></tr>
  <tr><td><b>ค่าติดตั้งและเดินสาย</b></td><td class="n">—</td><td class="n">60,000 – 120,000</td></tr>
  <tr class="total"><td><b>รวมลงทุนครั้งแรก</b></td><td class="n"></td><td class="n"><b>610,000 – 955,000</b></td></tr>
  <tr><td><b>ค่าใช้จ่ายรายปี</b> <span class="small">อินเทอร์เน็ตสาขา · ที่เก็บสำรองนอกสถานที่ · ค่าดูแล</span></td><td class="n">ต่อปี</td><td class="n">90,000 – 160,000</td></tr>
</table>
<div class="note">
  ซอฟต์แวร์ฝั่งเซิร์ฟเวอร์เป็นโอเพนซอร์สทั้งหมด (Linux · PostgreSQL · nginx) ไม่มีค่าไลเซนส์รายปี
  หากเลือกใช้ Windows Server จะมีค่าไลเซนส์เพิ่มประมาณ 30,000–60,000 บาทต่อเครื่อง
</div>

<h2>8. เรื่องที่ต้องเคาะก่อนสั่งซื้อ</h2>
<ul>
  <li><b>จำนวนผู้ใช้จริงต่อสาขา</b> — 100 คนพร้อมกันเป็นตัวเลขรวมทุกสาขา หรือต่อสาขา สเปกต่างกันชัดเจน ถ้าเป็นต่อสาขา (รวม 400 คน) ต้องขยับไปทางเลือก ข</li>
  <li><b>ห้องเซิร์ฟเวอร์มีแอร์และไฟสำรองหรือยัง</b> — เครื่องระดับนี้ต้องการอุณหภูมิคงที่ ถ้ายังไม่มีต้องบวกงบห้องเพิ่ม</li>
  <li><b>อินเทอร์เน็ตแต่ละสาขาเป็นแบบไหน</b> — ไฟเบอร์หรือ 4G มีไอพีคงที่หรือไม่ และจะทำ VPN แบบใด</li>
  <li><b>เครื่องชั่ง Floor Weight ต่ออย่างไร</b> — MSSQL อยู่เครื่องไหน เวอร์ชันอะไร เปิดให้อ่านจากเครื่องอื่นได้หรือยัง</li>
  <li><b>BPlus จะรับข้อมูลทางไหน</b> — คีย์ใบสำคัญทั่วไปวันละใบ หรือทำสคริปต์คีย์อัตโนมัติ มีผลว่าต้องซื้อพีซีเพิ่มอีก 1 เครื่องหรือไม่</li>
  <li><b>ระดับการหยุดที่ยอมรับได้</b> — ถ้ายอมให้หยุดเกิน 4 ชั่วโมงไม่ได้ ต้องเป็นทางเลือก ข</li>
  <li><b>ใครดูแลระบบหลังติดตั้ง</b> — มีทีมไอทีภายในหรือจ้างดูแลรายปี มีผลกับการเลือกระหว่างทางเลือก ก กับ ค</li>
</ul>

<p class="small" style="margin-top:18pt;border-top:0.75pt solid #cfd8ca;padding-top:6pt">
  ตัวเลขโหลดคำนวณจากโครงสร้างจริงของระบบ ChunERP (ฐานข้อมูล 34 ตาราง · หน้าเว็บ 2.1 MB · 4 สาขา) ·
  ราคาเป็นช่วงประมาณการสำหรับตั้งงบ ไม่ใช่ใบเสนอราคา · จัดทำ 8 กันยายน 2569
</p>

</div>
</body>
</html>
`

fs.mkdirSync(path.dirname(DEST), { recursive: true })
fs.writeFileSync(DEST, doc, 'utf8')
console.log(DEST, (fs.statSync(DEST).size / 1024).toFixed(0) + ' KB')
