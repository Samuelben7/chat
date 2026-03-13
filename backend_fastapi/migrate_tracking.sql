-- Tracking: Meta Pixel CAPI + Google Ads (opcionais por empresa)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(50);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS meta_capi_token TEXT;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS google_gtag_id VARCHAR(50);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS google_api_secret VARCHAR(200);
