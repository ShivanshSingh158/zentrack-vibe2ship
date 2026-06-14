import { auth, db } from './firebase';
import { getDoc, doc } from 'firebase/firestore';

const CLOUDINARY_CLOUD_NAME = 'drc8jwyjf';
const CLOUDINARY_UPLOAD_PRESET = 'aoaogtkw';

export const uploadFileToCloudinary = async (file: File): Promise<{ url: string; size: number; format: string }> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Unauthorized: You must be logged in to upload files.');

  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists() || userDoc.data().isAdmin !== true) {
    throw new Error('Forbidden: Storage is premium, admin-only access.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  // Cloudinary allows raw file uploads (like docx, pdf) by targeting the "auto" resource type
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to upload file to Cloudinary');
  }

  const data = await response.json();
  return {
    url: data.secure_url,
    size: data.bytes,
    format: data.format,
  };
};
