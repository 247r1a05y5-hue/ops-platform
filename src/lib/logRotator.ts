import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const LOG_DIR = path.resolve('logs');
const ARCHIVE_DIR = path.join(LOG_DIR, 'archive');

/**
 * Ensures that logs/ and logs/archive directories exist.
 */
function ensureDirs() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

let lastWriteDate = new Date().toISOString().split('T')[0];

/**
 * Checks if the day has changed since the last log write.
 * If yes, triggers rotation of all log files.
 */
function checkRotation() {
  ensureDirs();
  const currentDate = new Date().toISOString().split('T')[0];
  if (currentDate !== lastWriteDate) {
    rotate(lastWriteDate);
    lastWriteDate = currentDate;
  }
}

/**
 * Rotates and compresses logs for the specified date string.
 */
function rotate(dateStr: string) {
  const files = ['combined.log', 'api.log', 'error.log'];
  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const archivePath = path.join(ARCHIVE_DIR, `${file}.${dateStr}`);

    try {
      // Move current log to temp archive file
      fs.renameSync(filePath, archivePath);

      // Recreate empty log file immediately so writing can continue
      fs.writeFileSync(filePath, '', 'utf8');

      // Compress to gz asynchronously
      const gzip = zlib.createGzip();
      const source = fs.createReadStream(archivePath);
      const destination = fs.createWriteStream(`${archivePath}.gz`);

      source.pipe(gzip).pipe(destination).on('finish', () => {
        // Remove uncompressed archive file upon finish
        try {
          fs.unlinkSync(archivePath);
        } catch {}
      });
    } catch (err) {
      console.error(`[LogRotator] Rotation failed for ${file}:`, err);
    }
  }

  // Clean old log archives
  cleanOldLogs();
}

/**
 * Deletes archived logs older than 30 days.
 */
function cleanOldLogs() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return;
    const files = fs.readdirSync(ARCHIVE_DIR);
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);

    for (const file of files) {
      const filePath = path.join(ARCHIVE_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime < limitDate) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.error('[LogRotator] Failed cleaning old logs:', err);
  }
}

/**
 * Writes a log message to the specified log file, performing rotation checks first.
 * @param file The destination file prefix (combined, api, error)
 * @param message The text message to write
 */
export function writeLog(file: 'combined' | 'api' | 'error', message: string) {
  try {
    checkRotation();
    const filePath = path.join(LOG_DIR, `${file}.log`);
    fs.appendFileSync(filePath, message + '\n', 'utf8');
  } catch (err) {
    console.error(`[LogRotator] Failed writing log to ${file}:`, err);
  }
}
