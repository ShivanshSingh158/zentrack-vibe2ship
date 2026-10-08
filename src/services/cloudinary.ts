/**
 * Cloudinary Upload Service (Web)
 */

export const uploadFileToCloudinary = async (file: File): Promise<{ url: string; size: number }> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Please add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env file.');
  }

  // Preserve original file name in Cloudinary public ID so browser tabs & PDF viewers display proper names
  const lastDotIndex = file.name.lastIndexOf('.');
  const baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
  const cleanBaseName = (baseName || 'file')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'document';
  const uniqueFolder = `docs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const publicId = `zentrack/${uniqueFolder}/${cleanBaseName}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('public_id', publicId);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (data.secure_url) {
      return { url: data.secure_url, size: data.bytes };
    }
    throw new Error(data.error?.message || 'Upload failed');
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};
