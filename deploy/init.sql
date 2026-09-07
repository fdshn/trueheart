-- Khởi tạo database Chân Tâm.
-- PostGIS là bắt buộc: toàn bộ nghiệp vụ "ưu tiên cự ly gần" dựa trên
-- kiểu geography(Point,4326) và các hàm ST_DWithin / ST_Distance.
CREATE EXTENSION IF NOT EXISTS postgis;

-- unaccent + pg_trgm phục vụ tìm kiếm tiếng Việt có dấu ở giai đoạn sau.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
