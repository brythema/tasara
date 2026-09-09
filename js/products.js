// ============================================================
// TASARA — Product Management Module
// ============================================================

import { getSupabase, uploadFile, getPublicUrl } from './supabase.js';
import { toast } from './ui.js';
import { CONFIG } from './config.js';

const PRODUCT_BUCKET = 'product-images';

// Client-side validation mirrors the storage policies — the policies
// are the real enforcement, this gives users an early, readable error.
function validateImage(file) {
  const allowed = CONFIG.PRODUCT_IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    throw new Error(`"${file.name}" is not an accepted image type (JPG, PNG, or WEBP).`);
  }
  const maxBytes = CONFIG.PRODUCT_IMAGE_MAX_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`"${file.name}" exceeds the ${CONFIG.PRODUCT_IMAGE_MAX_SIZE_MB} MB limit.`);
  }
}

// Storage path: {userId}/{timestamp}-{random}.{ext}
// Random suffix guarantees uniqueness even for files uploaded in the
// same millisecond, and the sanitized extension keeps the path safe.
function buildImagePath(sellerId, file) {
  const rawExt = file.name.split('.').pop() || '';
  const ext = rawExt.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${sellerId}/${Date.now()}-${rand}.${ext}`;
}

async function uploadProductImage(sellerId, file) {
  validateImage(file);
  const path = buildImagePath(sellerId, file);
  await uploadFile(PRODUCT_BUCKET, path, file);
  const url = getPublicUrl(PRODUCT_BUCKET, path);
  if (!url) throw new Error(`Failed to resolve public URL for ${file.name}.`);
  return url;
}

export async function addProduct(sellerId, data) {
  const imagePaths = [];

  // Upload images if provided
  if (data.images && data.images.length > 0) {
    for (const file of data.images) {
      imagePaths.push(await uploadProductImage(sellerId, file));
    }
  }

  const { data: product, error } = await getSupabase().from('products').insert([{
    seller_id: sellerId,
    name: data.name,
    description: data.description,
    price: data.price,
    image_paths: imagePaths.filter(url => url), // remove empty URLs
  }]).select().single();

  if (error) throw error;
  toast('Product added!', 'success');
  return product;
}

export async function updateProduct(sellerId, productId, data) {
  const { data: existing, error: fetchError } = await getSupabase()
    .from('products')
    .select('image_paths')
    .eq('id', productId)
    .eq('seller_id', sellerId)
    .single();
  if (fetchError) throw fetchError;

  let imagePaths = existing?.image_paths || [];

  if (data.images && data.images.length > 0) {
    imagePaths = []; // replace old images
    for (const file of data.images) {
      imagePaths.push(await uploadProductImage(sellerId, file));
    }
  }

  const { error } = await getSupabase().from('products')
    .update({
      name: data.name,
      description: data.description,
      price: data.price,
      image_paths: imagePaths.filter(url => url),
    })
    .eq('id', productId)
    .eq('seller_id', sellerId);

  if (error) throw error;
  toast('Product updated!', 'success');
}

export async function deleteProduct(sellerId, productId) {
  const { error } = await getSupabase()
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('seller_id', sellerId);

  if (error) throw error;
  toast('Product deleted', 'warning');
}
