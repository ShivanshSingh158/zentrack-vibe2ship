/**
 * Cloudinary Upload Service (Mobile)
 * Direct-to-Cloudinary high-speed multipart upload without intermediate server hops.
 */

import { Platform } from 'react-native';

function inferMimeType(filename: string, fallbackType?: string): string {
  if (fallbackType && fallbackType !== 'application/octet-stream' && fallbackType !== '*/*') {
    return fallbackType;
  }
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/m4a';
    case 'wav':
      return 'audio/wav';
    default:
      return fallbackType || 'application/octet-stream';
  }
}

export const uploadFileToCloudinary = (
  uri: string,
  type: string,
  name: string,
  onProgress?: (progress: number) => void
): Promise<{ url: string; size: number; format?: string; resourceType?: string }> => {
  return new Promise((resolve, reject) => {
    try {
      const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'drc8jwyjf';
      const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'aoaogtkw';

      if (!cloudName || !uploadPreset) {
        return reject(
          new Error(
            'Cloudinary is not configured. Please verify EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.'
          )
        );
      }

      if (!uri) {
        return reject(new Error('Cannot upload empty file URI.'));
      }

      const cleanName = name || `file_${Date.now()}`;
      const cleanType = inferMimeType(cleanName, type);

      // React Native FormData file object normalization
      const fileToUpload = {
        uri,
        type: cleanType,
        name: cleanName,
      };

      const formData = new FormData();
      formData.append('file', fileToUpload as any);
      formData.append('upload_preset', uploadPreset);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
      xhr.timeout = 60000; // 60s timeout

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(Math.min(100, Math.max(0, percent)));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const secureUrl = data.secure_url || (data.url ? data.url.replace(/^http:/, 'https:') : '');
            resolve({
              url: secureUrl,
              size: data.bytes || 0,
              format: data.format,
              resourceType: data.resource_type,
            });
          } catch {
            reject(new Error('Failed to parse Cloudinary response'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData?.error?.message || `Upload failed with HTTP ${xhr.status}`));
          } catch {
            reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.ontimeout = () => reject(new Error('Upload timed out. Please check your internet connection.'));
      xhr.onerror = () => reject(new Error('Network error during file upload to Cloudinary.'));
      xhr.send(formData);
    } catch (err: any) {
      console.warn('[Cloudinary] Sync error preparing upload:', err);
      reject(err);
    }
  });
};
