const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
const sql = fs.readFileSync('packages/sync-engine/src/schema.sql', 'utf8');
db.exec(sql);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables created:', tables.map(t => t.name));

// Verify INTEGER types for money columns
const columns = db.prepare("PRAGMA table_info(journal_entries)").all();
console.log('journal_entries columns:', columns.map(c => `${c.name}:${c.type}`));

const accColumns = db.prepare("PRAGMA table_info(accounts)").all();
console.log('accounts columns:', accColumns.map(c => `${c.name}:${c.type}`));

const iouColumns = db.prepare("PRAGMA table_info(iou_records)").all();
console.log('iou_records columns:', iouColumns.map(c => `${c.name}:${c.type}`));

const sfColumns = db.prepare("PRAGMA table_info(sinking_funds)").all();
console.log('sinking_funds columns:', sfColumns.map(c => `${c.name}:${c.type}`));
