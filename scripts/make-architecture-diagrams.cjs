/*
 * สร้างเอกสาร Word (.html) พร้อมไดอะแกรม
 *
 * ทดสอบกับ Word 16 แล้ว: inline SVG ถูกทิ้งทั้งภาพ ส่วน PNG แบบ data URI และ
 * ตารางที่วาดด้วยเส้นขอบขึ้นครบ ไดอะแกรมจึงต้องเรนเดอร์เป็น PNG ก่อนฝัง
 */
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p))

const OUT = path.resolve(process.argv[2] || '.')

/* ── สไตล์ร่วมของไดอะแกรม ─────────────────────────────────────────────── */
const DIAGRAM_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Sarabun', sans-serif; background: #ffffff; padding: 26px; }
  .d { width: 900px; display: flex; flex-direction: column; gap: 14px; color: #22302a; padding: 14px 2px 4px; }

  .zone { border: 1.5px dashed #b9c8b6; border-radius: 10px; padding: 12px 14px 14px; position: relative; }
  .zone > .ztitle {
    position: absolute; top: -11px; left: 14px; background: #ffffff; padding: 0 8px;
    font-size: 12.5px; font-weight: 700; letter-spacing: .3px; color: #5f7a3c;
  }
  .zone.hq { border-color: #2a5340; }
  .zone.hq > .ztitle { color: #2a5340; }
  .zone.ext { border-color: #a8763f; }
  .zone.ext > .ztitle { color: #a8763f; }

  .row { display: flex; gap: 12px; align-items: stretch; }
  .row > * { flex: 1; }

  .box {
    border: 1.5px solid #cbd8c8; border-radius: 8px; background: #f7faf6;
    padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-height: 62px;
  }
  .box b { font-size: 14px; font-weight: 700; line-height: 1.35; }
  .box span { font-size: 12px; color: #5c6b62; line-height: 1.45; }
  .box.app { background: #eaf1e6; border-color: #6e8b54; }
  .box.db { background: #e4ece7; border-color: #2a5340; }
  .box.net { background: #eaeef3; border-color: #46617f; }
  .box.ext { background: #f7f0e8; border-color: #a8763f; }
  .box.power { background: #f9f1ee; border-color: #9a4234; }

  .flow { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 2px 0; }
  .flow .lbl {
    font-size: 11.5px; color: #5c6b62; background: #eef2ec;
    border-radius: 999px; padding: 2px 12px; white-space: nowrap;
  }
  .flow .ln { height: 0; border-top: 1.5px solid #9fb29a; flex: 1; }
  .flow .tip { color: #6e8b54; font-size: 17px; line-height: 1; }

  .host { border: 1.5px solid #2a5340; border-radius: 9px; padding: 11px; background: #ffffff; }
  .host .hlabel { font-size: 12px; font-weight: 700; color: #2a5340; margin-bottom: 8px; }
  .tag {
    display: inline-block; font-size: 10.5px; font-weight: 600; color: #2a5340;
    background: rgba(42,83,64,.10); border-radius: 4px; padding: 1px 7px; margin-top: 4px;
  }
`

/* ── ไดอะแกรม 1: ฮาร์ดแวร์และการติดตั้ง ───────────────────────────────── */
const DIAGRAM_DEPLOY = `
<div class="d">

  <div class="zone">
    <span class="ztitle">สาขา 4 แห่ง — กำแพงเพชร · นครไทย · เพชรบูรณ์ · เลย</span>
    <div class="row">
      <div class="box"><b>จุดคัดแยก</b><span>แท็บเล็ต 2 เครื่อง · Wi-Fi<br>ออกใบคิว · บันทึกผลคัดแยก</span></div>
      <div class="box"><b>จุดชั่งน้ำหนัก</b><span>พีซี 1 + เครื่องพิมพ์ A4 + UPS<br>ดึงน้ำหนัก · ปิดรายการรับซื้อ</span></div>
      <div class="box"><b>สำนักงานสาขา</b><span>พีซี 2–3 เครื่อง<br>ใบจอง · ตัดหนี้ · จ่ายเงิน</span></div>
    </div>
  </div>

  <div class="flow">
    <div class="ln"></div>
    <span class="lbl">อินเทอร์เน็ตไฟเบอร์ + สำรอง 4G · เชื่อมด้วย VPN</span>
    <div class="ln"></div>
    <span class="tip">&#9660;</span>
  </div>

  <div class="zone hq">
    <span class="ztitle">ห้องเซิร์ฟเวอร์ สำนักงานใหญ่</span>
    <div class="row" style="margin-bottom:12px">
      <div class="box net" style="flex:1"><b>ไฟร์วอลล์ / เราเตอร์ VPN</b><span>จุดเดียวที่ออกอินเทอร์เน็ต · แยกวงสาขาออกจากวงเซิร์ฟเวอร์</span></div>
    </div>
    <div class="host">
      <div class="hlabel">เครื่องเซิร์ฟเวอร์ 1 ตัว (Hypervisor) — 8 คอร์ / 64 GB ECC / NVMe RAID1</div>
      <div class="row">
        <div class="box app"><b>VM-APP</b><span>nginx เสิร์ฟหน้าเว็บ + API<br>4 vCPU · 8 GB</span><span class="tag">Linux · Node</span></div>
        <div class="box db"><b>VM-DB</b><span>PostgreSQL 16 · 34 ตาราง<br>4 vCPU · 16 GB</span><span class="tag">โต 3–6 GB / ปี</span></div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="box"><b>NAS สำรองข้อมูล</b><span>RAID1 8 TB · ดัมป์ทุกคืน + WAL ตลอดเวลา</span></div>
      <div class="box power"><b>UPS 3000VA</b><span>จ่ายไฟสำรอง 30 นาที · สั่งปิดเครื่องอัตโนมัติ</span></div>
    </div>
  </div>

  <div class="flow">
    <div class="ln"></div>
    <span class="lbl">วง LAN เดียวกัน — ไม่ออกอินเทอร์เน็ต</span>
    <div class="ln"></div>
    <span class="tip">&#9660;</span>
  </div>

  <div class="zone ext">
    <span class="ztitle">ระบบเดิมที่ต้องเชื่อม</span>
    <div class="row">
      <div class="box ext"><b>Floor Weight Cocoon</b><span>MSSQL · เครื่องชั่งหน้างาน<br><b style="font-size:12px">ChunERP อ่านอย่างเดียว ไม่เคยเขียนกลับ</b></span></div>
      <div class="box ext"><b>BPlus (บัญชี)</b><span>รับไฟล์ CSV จากโฟลเดอร์กลาง<br>ไม่มี API · ไม่แตะฐานข้อมูล</span></div>
    </div>
  </div>

</div>
`

/* ── ไดอะแกรม 2: ชั้นซอฟต์แวร์และการไหลของข้อมูล ──────────────────────── */
const DIAGRAM_SOFTWARE = `
<div class="d">
  <div class="row">
    <div class="box"><b>1 · เบราว์เซอร์</b><span>หน้าเว็บ React 2.1 MB<br>โหลดครั้งแรกครั้งเดียว แล้วแคช</span></div>
    <div class="box app"><b>2 · nginx</b><span>เสิร์ฟไฟล์หน้าเว็บ<br>ส่งต่อ /api ให้ API</span></div>
    <div class="box app"><b>3 · API</b><span>ตรวจสิทธิ์ · กฎธุรกิจ · คำนวณเงิน<br>ทุกยอดคำนวณที่นี่ ไม่ใช่ที่หน้าจอ</span></div>
    <div class="box db"><b>4 · PostgreSQL</b><span>เก็บเอกสารทั้งหมด<br>34 ตาราง</span></div>
  </div>

  <div class="flow">
    <span class="lbl">API เป็นตัวเดียวที่คุยกับระบบภายนอก — หน้าเว็บไม่เคยต่อตรง</span>
  </div>

  <div class="row">
    <div class="box ext"><b>ดึงน้ำหนัก</b><span>API &#8594; MSSQL เครื่องชั่ง<br>กรองด้วยรหัสเกษตรกร + วันที่ชั่ง</span></div>
    <div class="box ext"><b>ส่งบัญชี</b><span>API สร้าง CSV 4 ชนิด<br>ตั้งหนี้ · ซื้อ · ตัดหนี้ · จ่ายเงิน</span></div>
    <div class="box"><b>สำรองข้อมูล</b><span>PostgreSQL &#8594; NAS<br>ยอมเสียข้อมูลไม่เกิน 15 นาที</span></div>
  </div>
</div>
`

async function render(browser, html, name) {
  const page = await browser.newPage()
  await page.setViewport({ width: 960, height: 800, deviceScaleFactor: 2 })
  await page.setContent(`<style>${DIAGRAM_CSS}</style>${html}`, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 900))
  const el = await page.$('.d')
  const buf = await el.screenshot({ type: 'png' })
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf)
  await page.close()
  console.log(name, (buf.length / 1024).toFixed(0) + ' KB')
  return buf.toString('base64')
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const deploy = await render(browser, DIAGRAM_DEPLOY, 'diagram-deploy')
  const software = await render(browser, DIAGRAM_SOFTWARE, 'diagram-software')
  await browser.close()

  fs.writeFileSync(path.join(OUT, 'diagrams.json'), JSON.stringify({ deploy, software }))
  console.log('base64 saved -> diagrams.json')
})()
