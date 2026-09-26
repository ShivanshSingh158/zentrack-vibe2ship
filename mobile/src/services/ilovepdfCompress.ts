import * as FileSystem from 'expo-file-system/legacy';

// iLovePDF REST API v1
// Auth:    POST https://api.ilovepdf.com/v1/auth         -> JWT token
// Start:   GET  https://api.ilovepdf.com/v1/start/{tool} -> { server, task }
// Upload:  POST https://{server}/v1/upload               -> { server_filename }
// Process: POST https://{server}/v1/process              -> 200 OK
// Download: GET https://{server}/v1/download/{task}      -> binary PDF
const ILOVE_BASE = 'https://api.ilovepdf.com/v1';
const PUBLIC_KEY = process.env.EXPO_PUBLIC_ILOVEPDF_PUBLIC_KEY || '';

export type ILovePdfCompressionLevel = 'recommended' | 'extreme' | 'low';

function getSafeFileName(fileName: string): string {
  return (fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function getToken(): Promise<string> {
  const res = await fetch(`${ILOVE_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: PUBLIC_KEY }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`iLovePDF auth failed: HTTP ${res.status} ${body}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error('iLovePDF auth: no token in response');
  return data.token;
}

async function startTask(token: string): Promise<{ server: string; task: string }> {
  const res = await fetch(`${ILOVE_BASE}/start/compress`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`iLovePDF start task failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.server || !data.task) throw new Error('iLovePDF start: missing server/task');
  return { server: data.server, task: data.task };
}

async function uploadFile(
  server: string,
  task: string,
  token: string,
  uri: string,
  fileName: string,
): Promise<string> {
  const safeName = getSafeFileName(fileName);
  const uploadRes = await FileSystem.uploadAsync(
    `https://${server}/v1/upload`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'application/pdf',
      parameters: { task },
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new Error(`iLovePDF upload failed: HTTP ${uploadRes.status} ${uploadRes.body}`);
  }
  const data = JSON.parse(uploadRes.body);
  if (!data.server_filename) throw new Error('iLovePDF upload: no server_filename');
  return data.server_filename;
}

async function processTask(
  server: string,
  task: string,
  token: string,
  serverFilename: string,
  originalFileName: string,
  compressionLevel: ILovePdfCompressionLevel = 'recommended',
): Promise<void> {
  const safeName = getSafeFileName(originalFileName);
  const body = {
    task,
    tool: 'compress',
    files: [{ server_filename: serverFilename, filename: safeName }],
    compression_level: compressionLevel,
  };
  const res = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`iLovePDF process failed: HTTP ${res.status} ${errText}`);
  }
}

async function downloadResult(
  server: string,
  task: string,
  token: string,
  fileName: string,
): Promise<string> {
  const safeName = getSafeFileName(fileName);
  const destUri = `${FileSystem.cacheDirectory}compressed_${Date.now()}_${safeName}`;
  const dlRes = await FileSystem.downloadAsync(
    `https://${server}/v1/download/${task}`,
    destUri,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (dlRes.status < 200 || dlRes.status >= 300) {
    throw new Error(`iLovePDF download failed: HTTP ${dlRes.status}`);
  }
  return dlRes.uri;
}

export const compressPdfWithILovePDF = async (
  uri: string,
  fileName: string,
  onStep?: (step: string) => void,
  compressionLevel: ILovePdfCompressionLevel = 'recommended',
): Promise<string> => {
  if (!PUBLIC_KEY) {
    throw new Error(
      'iLovePDF public key not set. Add EXPO_PUBLIC_ILOVEPDF_PUBLIC_KEY to .env and rebuild the app.'
    );
  }

  onStep?.('Authenticating with compressor...');
  const token = await getToken();

  onStep?.(`Starting ${compressionLevel} compression...`);
  const { server, task } = await startTask(token);

  onStep?.('Uploading to compressor...');
  const serverFilename = await uploadFile(server, task, token, uri, fileName);

  onStep?.(`Compressing (${compressionLevel})...`);
  await processTask(server, task, token, serverFilename, fileName, compressionLevel);

  onStep?.('Downloading compressed file...');
  const compressedUri = await downloadResult(server, task, token, fileName);

  return compressedUri;
};

