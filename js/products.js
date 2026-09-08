// ============================================================
// TASARA — Product Management Module
// ============================================================

import { getSupabase, uploadFile } from './supabase.js';
import { toast } from './ui.js';

const PRODUCT_BUCKET = 'product-images';

export async function addProduct(sellerId, data) {
  const imagePaths = [];

  // Upload images if provided
  if (data.images && data.images.length > 0) {
    for (const file of data.images) {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const path = `${sellerId}/${timestamp}.${ext}`;
      await uploadFile(PRODUCT_BUCKET, path, file);
      // Get public URL for product images
      const { data: urlData } = getSupabase().storage
        .from(PRODUCT_BUCKET)
        .getPublicUrl(path);
      imagePaths.push(urlData.publicUrl);
    }
  }

  const { data: product, error } = await getSupabase().from('products').insert([{
    seller_id: sellerId,
    name: data.name,
    description: data.description,
    price: data.price,
    image_paths: imagePaths,
  }]).select().single();

  if (error) throw error;
  toast('Product added!', 'success');
  return product;
}

export async function updateProduct(sellerId, productId, data) {
  const { data: existing } = await getSupabase()
    .from('products')
    .select('image_paths')
    .eq('id', productId)
    .single();

  let imagePaths = existing?.image_paths || [];

  if (data.images && data.images.length > 0) {
    imagePaths = []; // replace old images
    for (const file of data.images) {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const path = `${sellerId}/${timestamp}.${ext}`;
      await uploadFile(PRODUCT_BUCKET, path, file);
      const { data: urlData } = getSupabase().storage
        .from(PRODUCT_BUCKET)
        .getPublicUrl(path);
      imagePaths.push(urlData.publicUrl);
    }
  }

  const { error } = await getSupabase().from('products')
    .update({
      name: data.name,
      description: data.description,
      price: data.price,
      image_paths: imagePaths,
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
