/* ============================================================================
   PAMUUC — website intake → Google Sheet
   ---------------------------------------------------------------------------
   Paste this into Extensions → Apps Script on the "PAMUUC — Requests (website
   intake)" spreadsheet, then Deploy → New deployment → Web app. The URL it
   gives you becomes the Worker's SHEET_URL secret. See worker/README.md.

   The sheet is a convenience, not the system of record: the request has
   already been emailed to the studio by the time this runs, and the Worker
   ignores whatever this returns. So nothing here may ever throw in a way that
   matters — a failure costs a row in a spreadsheet, not a customer.

   Three things it does that the obvious ten-line version does not:

     it builds its own header row, so there is nothing to set up by hand and
     nothing to mistype;

     it adds a column when the Worker starts sending a field the sheet does
     not have, rather than dropping it silently — which is how you discover
     six months later that "Proposed call" was never recorded;

     it takes a lock. Two forms submitted in the same second would otherwise
     read the same last row and one would overwrite the other.
   ========================================================================= */

/* The tab this writes to. Named rather than "the first sheet", so dragging a
   tab around in the spreadsheet cannot quietly redirect the intake. */
const SHEET_NAME = 'Requests';

/* The columns the Worker sends today, in the order they are most useful to
   read. Anything it sends that is not here gets a column of its own appended
   on the right; anything here that it does not send stays blank. */
const COLUMNS = [
  'Reference', 'Received', 'Type', 'Status', 'Answered',
  'Name', 'Last name', 'Company', 'Email', 'Phone', 'Country', 'Marketing opt-in',
  /* These seven describe the FIRST product on a request. "Items" carries every
     product, one per line, because a basket can hold several and this sheet is
     read by filtering it — a request whose second line was the polo shirt did
     not answer a search for polo shirts. */
  'Product', 'SKU', 'Colour', 'Quantity', 'Fit', 'Weight',
  'Personalisation', 'Placement', 'Items', 'Products on request',
  'Artwork', 'Artwork file',
  'Project type', 'Team size', 'Timeline', 'Proposed call',
  /* There is no discount code any longer: the studio applies the first order
     rate when it prices the quote, and this is only the marker that the
     customer asked about it. "Offer" is which offer a subscriber joined. */
  'First order', 'Offer', 'Message', 'Consent', 'Locale', 'Source',
];

/* Columns that hold a lot of text and would otherwise stretch the sheet. */
const WIDE = { Message: 420, Items: 340, Artwork: 260, 'Proposed call': 180, Email: 220 };

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    /* 30s: long enough for a burst of submissions to queue rather than
       collide, short enough that a stuck script gives up rather than hangs. */
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: 'no body' });
    }
    const body = JSON.parse(e.postData.contents);

    const sheet = getSheet();
    const headers = syncHeaders(sheet, Object.keys(body));

    /* A resend of the same reference updates its row instead of adding a
       second one. The Worker does not retry today, but a duplicated request
       in a sales sheet is worse than a slightly slower append. */
    const existing = body.Reference ? findRow(sheet, headers, body.Reference) : 0;
    const row = headers.map(function (h) {
      const v = body[h];
      return v === undefined || v === null ? '' : v;
    });

    if (existing) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
      return reply({ ok: true, updated: existing });
    }
    sheet.appendRow(row);
    return reply({ ok: true, row: sheet.getLastRow() });

  } catch (err) {
    /* Never throw: an Apps Script error page is HTML, and the Worker would
       log that as a wall of markup instead of a reason. */
    return reply({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/* So you can check the deployment works before putting the URL in the Worker:
   open it in a browser and you should see {"ok":true,...}. */
function doGet() {
  const sheet = getSheet();
  return reply({
    ok: true,
    sheet: SHEET_NAME,
    rows: Math.max(0, sheet.getLastRow() - 1),
    columns: sheet.getLastColumn(),
  });
}

/* ---- the sheet ---------------------------------------------------------- */

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  /* A brand new spreadsheet arrives with one tab called "Sheet1" or its
     translation. If it is still empty, rename it rather than leaving an
     orphan beside the real one. */
  const first = ss.getSheets()[0];
  if (ss.getSheets().length === 1 && first.getLastRow() === 0) {
    first.setName(SHEET_NAME);
    return first;
  }
  return ss.insertSheet(SHEET_NAME);
}

/**
 * Returns the header row, creating it if the sheet is empty and extending it
 * if the payload carries a field the sheet has never seen.
 */
function syncHeaders(sheet, keys) {
  let headers = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String)
    : [];

  if (!headers.length) {
    headers = COLUMNS.slice();
    writeHeaders(sheet, headers);
    dressUp(sheet, headers);
  }

  const missing = keys.filter(function (k) { return headers.indexOf(k) === -1; });
  if (missing.length) {
    headers = headers.concat(missing);
    writeHeaders(sheet, headers);
    dressUp(sheet, headers);
  }
  return headers;
}

function writeHeaders(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function dressUp(sheet, headers) {
  const head = sheet.getRange(1, 1, 1, headers.length);
  head.setFontWeight('bold');
  head.setBackground('#011251');          /* PAMUUC navy */
  head.setFontColor('#F4F2ED');
  head.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);

  for (let i = 0; i < headers.length; i++) {
    const w = WIDE[headers[i]];
    if (w) sheet.setColumnWidth(i + 1, w);
  }
  /* Long messages read better wrapped than spilling across the row. Items is
     one product per line and has to keep those line breaks to be readable. */
  ['Message', 'Items'].forEach(function (name) {
    const c = headers.indexOf(name);
    if (c === -1) return;
    sheet.getRange(2, c + 1, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  });
  /* A filter makes the sheet usable the moment the first request lands. */
  try { if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter(); }
  catch (ignored) {}
}

/** Row number of an existing reference, or 0. */
function findRow(sheet, headers, reference) {
  const col = headers.indexOf('Reference') + 1;
  if (!col || sheet.getLastRow() < 2) return 0;
  const refs = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < refs.length; i++) {
    if (String(refs[i][0]) === String(reference)) return i + 2;
  }
  return 0;
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---- run this once from the editor to set the sheet up now --------------
   Optional. The header row appears by itself when the first request arrives;
   this just does it early so the sheet does not look empty while you wait.
   Select `setUp` in the toolbar and press Run.                            */
function setUp() {
  const sheet = getSheet();
  syncHeaders(sheet, COLUMNS);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    SHEET_NAME + ' is ready — ' + COLUMNS.length + ' columns.', 'PAMUUC intake', 5);
}
