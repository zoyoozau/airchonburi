/**
 * ชลบุรี แอร์แคร์ - Google Apps Script backend
 * 1) ใส่ SPREADSHEET_ID ใน Script properties (หรือ bind script ไว้กับ Sheet)
 * 2) Run setupSheets() หนึ่งครั้ง
 * 3) ตั้งค่า INITIAL_ADMIN_* ใน Script properties แล้ว Run createInitialAdmin() หนึ่งครั้ง
 * 4) Deploy > New deployment > Web app > Execute as Me > Who has access: Anyone
 */
const SHEETS = { customers: 'Customers', pointLog: 'PointLog', users: 'Users', settings: 'Settings' };
const HEADERS = {
  Customers: ['customer_id', 'name', 'phone', 'joined_at', 'expires_at', 'address', 'points', 'tier', 'updated_at', 'updated_by'],
  PointLog: ['log_id', 'customer_id', 'delta', 'before_points', 'after_points', 'note', 'created_at', 'created_by'],
  Users: ['user_id', 'username', 'password_hash', 'salt', 'name', 'role', 'active', 'created_at', 'last_login'],
  Settings: ['key', 'value']
};

function doGet() { return output_({ ok: true, service: 'air-care-api', message: 'POST JSON to use the API' }); }

function doPost(e) {
  try {
    const body = JSON.parse(e?.postData?.contents || '{}');
    if (body.action === 'login') return output_(login_(body));
    const auth = requireAuth_(body.token);
    switch (body.action) {
      case 'listCustomers': return output_({ ok: true, customers: listCustomers_() });
      case 'saveCustomer': return output_(saveCustomer_(auth, body.customer || {}));
      case 'pointDelta': return output_(pointDelta_(auth, body));
      default: throw new Error('ไม่รู้จักคำสั่งนี้');
    }
  } catch (error) { return output_({ ok: false, error: error.message || 'เกิดข้อผิดพลาด' }); }
}

function setupSheets() {
  const spreadsheet = spreadsheet_();
  Object.keys(HEADERS).forEach(name => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[name]);
    sheet.setFrozenRows(1);
  });
  Logger.log('สร้างโครงสร้างชีตเรียบร้อย: ' + spreadsheet.getUrl());
}

function createUser(username, password, name, role) {
  if (!username || !password) throw new Error('ต้องระบุ username และ password');
  const sheet = spreadsheet_().getSheetByName(SHEETS.users);
  const salt = Utilities.getUuid();
  sheet.appendRow([Utilities.getUuid(), String(username).trim(), hash_(password, salt), salt, name || username, role || 'staff', true, new Date(), '']);
  Logger.log('เพิ่มผู้ใช้ ' + username + ' แล้ว (อย่าเก็บรหัสผ่านจริงไว้ในโค้ด)');
}

function createInitialAdmin() {
  const props = PropertiesService.getScriptProperties();
  const username = props.getProperty('INITIAL_ADMIN_USERNAME');
  const password = props.getProperty('INITIAL_ADMIN_PASSWORD');
  if (!username || !password) throw new Error('ตั้งค่า INITIAL_ADMIN_USERNAME และ INITIAL_ADMIN_PASSWORD ใน Script properties ก่อน');
  createUser(username, password, props.getProperty('INITIAL_ADMIN_NAME') || username, 'admin');
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  Logger.log('สร้าง admin แล้ว และลบรหัสผ่านเริ่มต้นออกจาก Script properties');
}

function login_(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  const rows = sheetRows_(SHEETS.users);
  const row = rows.find(item => String(item.username).toLowerCase() === username.toLowerCase());
  if (!row || !truthy_(row.active) || hash_(password, row.salt) !== row.password_hash) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  const user = { id: row.user_id, username: row.username, name: row.name, role: row.role };
  updateUserLogin_(row);
  return { ok: true, token: sign_(user), user };
}

function requireAuth_(token) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบ');
  const payload = verify_(token);
  const row = sheetRows_(SHEETS.users).find(item => item.user_id === payload.id);
  if (!row || !truthy_(row.active)) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
  return { id: row.user_id, username: row.username, name: row.name, role: row.role };
}

function listCustomers_() { return sheetRows_(SHEETS.customers).map(row => ({ id: row.customer_id, name: row.name, phone: row.phone, joinedAt: dateString_(row.joined_at), expiresAt: dateString_(row.expires_at), address: row.address, points: Number(row.points || 0), tier: row.tier || 'ธรรมดา' })); }

function saveCustomer_(auth, customer) {
  if (!customer.name || !customer.phone || !customer.joinedAt || !customer.expiresAt) throw new Error('กรุณากรอกชื่อ เบอร์โทร วันที่สมัคร และวันหมดอายุ');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = spreadsheet_().getSheetByName(SHEETS.customers);
    const values = sheet.getDataRange().getValues(); const headers = values.shift(); const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    const id = customer.id || Utilities.getUuid(); const rowIndex = values.findIndex(row => String(row[index.customer_id]) === id); const row = [id, customer.name, customer.phone, customer.joinedAt, customer.expiresAt, customer.address || '', Math.max(0, Number(customer.points || 0)), customer.tier === 'VIP' ? 'VIP' : 'ธรรมดา', new Date(), auth.username];
    if (rowIndex < 0) sheet.appendRow(row); else sheet.getRange(rowIndex + 2, 1, 1, row.length).setValues([row]);
    return { ok: true, customer: { ...customer, id, points: row[6], tier: row[7] } };
  } finally { lock.releaseLock(); }
}

function pointDelta_(auth, body) {
  const delta = Number(body.delta); if (!Number.isInteger(delta) || Math.abs(delta) > 1000 || delta === 0) throw new Error('จำนวนแต้มไม่ถูกต้อง');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = spreadsheet_().getSheetByName(SHEETS.customers); const values = sheet.getDataRange().getValues(); const headers = values.shift(); const index = Object.fromEntries(headers.map((header, i) => [header, i])); const rowIndex = values.findIndex(row => String(row[index.customer_id]) === String(body.id));
    if (rowIndex < 0) throw new Error('ไม่พบลูกค้า');
    const row = values[rowIndex]; const before = Number(row[index.points] || 0); const after = Math.max(0, before + delta); sheet.getRange(rowIndex + 2, index.points + 1).setValue(after); sheet.getRange(rowIndex + 2, index.updated_at + 1, 1, 2).setValues([[new Date(), auth.username]]);
    spreadsheet_().getSheetByName(SHEETS.pointLog).appendRow([Utilities.getUuid(), body.id, delta, before, after, body.note || '', new Date(), auth.username]);
    return { ok: true, customer: { id: body.id, points: after } };
  } finally { lock.releaseLock(); }
}

function spreadsheet_() { const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheetRows_(name) { const sheet = spreadsheet_().getSheetByName(name); if (!sheet || sheet.getLastRow() < 2) return []; const values = sheet.getDataRange().getValues(); const headers = values.shift(); return values.filter(row => row.some(value => value !== '')).map(row => Object.fromEntries(headers.map((header, i) => [header, row[i]]))); }
function updateUserLogin_(user) { const sheet = spreadsheet_().getSheetByName(SHEETS.users); const values = sheet.getDataRange().getValues(); const headers = values.shift(); const id = headers.indexOf('user_id'); const lastLogin = headers.indexOf('last_login'); const rowIndex = values.findIndex(row => row[id] === user.user_id); if (rowIndex >= 0) sheet.getRange(rowIndex + 2, lastLogin + 1).setValue(new Date()); }
function hash_(password, salt) { const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + String(password), Utilities.Charset.UTF_8); return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function secret_() { return PropertiesService.getScriptProperties().getProperty('SESSION_SECRET') || 'CHANGE_THIS_SESSION_SECRET_IN_SCRIPT_PROPERTIES'; }
function sign_(user) { const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 12 })).replace(/=+$/, ''); return payload + '.' + hmac_(payload); }
function verify_(token) { const parts = String(token).split('.'); if (parts.length !== 2 || hmac_(parts[0]) !== parts[1]) throw new Error('เซสชันไม่ถูกต้อง'); const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); if (!payload.exp || payload.exp < Date.now()) throw new Error('เซสชันหมดอายุ'); return payload; }
function hmac_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret_(), Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function truthy_(value) { return value === true || String(value).toLowerCase() === 'true' || String(value) === '1'; }
function dateString_(value) { if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd'); return value ? String(value).slice(0, 10) : ''; }
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
