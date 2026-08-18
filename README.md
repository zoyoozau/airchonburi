# ระบบแต้มล้างแอร์ — ชลบุรี แอร์แคร์

PWA หน้าเว็บสำหรับมือถือ ใช้ Google Apps Script เป็น API และ Google Sheet เป็นข้อมูลกลาง โดยมี Cloudflare Pages เป็นโฮสต์ฟรีของหน้า PWA และ Pages Function เป็น proxy ให้เว็บเรียก Apps Script ได้โดยไม่ติดปัญหา CORS

## 1. เตรียม Google Sheet และ Apps Script

1. สร้าง Google Sheet ใหม่ แล้วเปิด Extensions > Apps Script
2. คัดลอกไฟล์ `gas/Code.gs` ไปวางใน Apps Script
3. ไปที่ Project Settings > Script properties แล้วเพิ่ม:
   - `SPREADSHEET_ID` = ตัวอักษรระหว่าง `/d/` และ `/edit` ใน URL ของ Sheet
   - `SESSION_SECRET` = รหัสยาวสุ่มอย่างน้อย 32 ตัวอักษร
4. Run `setupSheets()` หนึ่งครั้งและอนุญาตสิทธิ์
5. เพิ่ม Script properties ชั่วคราว `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME` แล้ว Run `createInitialAdmin()` หนึ่งครั้ง จากนั้นลบ `INITIAL_ADMIN_PASSWORD` ออก
6. Deploy > New deployment > Web app
   - Execute as: Me
   - Who has access: Anyone
7. คัดลอก URL ที่ลงท้ายด้วย `/exec`

ข้อมูลผู้ใช้จะเก็บเป็น password hash + salt ใน `Users` ไม่เก็บรหัสผ่านจริง

## 2. Deploy ฟรีด้วย Cloudflare Pages

1. สร้าง repository ใหม่บน GitHub แล้ว push ไฟล์ชุดนี้ขึ้นไป
2. เข้า Cloudflare Dashboard > Workers & Pages > Create application > Pages > Connect to Git
3. เลือก repository นี้
4. ตั้งค่า Build command เป็นว่าง และ Output directory เป็น `/` (โปรเจกต์นี้เป็น static site)
5. หลังสร้างโปรเจกต์ ไปที่ Settings > Variables and Secrets > Add variable:
   - ชื่อ `GAS_WEB_APP_URL`
   - ค่าเป็น URL `/exec` จาก Apps Script
6. Deploy ใหม่ แล้วเปิด URL ที่ Cloudflare ให้มา
7. เปิด URL บน Chrome Android แล้วเลือก Install app

Cloudflare Pages จะเสิร์ฟ `index.html`, `manifest.webmanifest`, `sw.js` และไอคอนโลโก้ ส่วน `/api` จะถูกส่งต่อไปยัง Apps Script ผ่าน `functions/api.js`

### ทางเลือก: ไม่ใช้ Git

ไม่จำเป็นต้องเชื่อม Git ครับ แต่เพราะโปรเจกต์นี้มี `functions/api.js` จึงต้องอัปโหลดด้วย Wrangler CLI (การลากไฟล์บนหน้าเว็บไม่รองรับการคอมไพล์โฟลเดอร์ `functions`)

```bash
npx wrangler login
npx wrangler pages project create aircare-pwa
npx wrangler pages deploy . --project-name=aircare-pwa
```

จากนั้นตั้งค่า `GAS_WEB_APP_URL` ใน Cloudflare Pages > Settings > Variables and Secrets แล้ว deploy ด้วยคำสั่งเดิมทุกครั้งที่มีการแก้ไข

ถ้าต้องการให้แก้โค้ดแล้ว deploy อัตโนมัติ ค่อยเลือก Git integration ภายหลังได้ แต่ Direct Upload project จะเปลี่ยนไปเป็น Git integration โดยตรงไม่ได้ ต้องสร้าง Pages project ใหม่ [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## โหมดดูตัวอย่าง

เปิด URL ต่อท้ายด้วย `?demo=1` เพื่อดูหน้าจอโดยไม่ต้องเชื่อม Apps Script เช่น `https://โดเมนของคุณ.pages.dev/?demo=1`

ก่อนใช้งานจริงให้ลบหรือไม่เผยแพร่โหมดตัวอย่าง และใช้รหัสผ่านจริงที่ตั้งใหม่เท่านั้น
