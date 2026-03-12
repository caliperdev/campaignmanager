-- Lookup tables: one column (name) each. Options managed from Supabase dashboard.
CREATE TABLE traffickers (name text PRIMARY KEY);
CREATE TABLE ams (name text PRIMARY KEY);
CREATE TABLE qa_ams (name text PRIMARY KEY);
CREATE TABLE formats (name text PRIMARY KEY);
CREATE TABLE categories (name text PRIMARY KEY);
CREATE TABLE deals (name text PRIMARY KEY);

INSERT INTO traffickers (name) VALUES
  ('Alejandro Bernis'), ('Alejandro Ricci'), ('Axel Alvez'),
  ('Facundo Baccile'), ('Ibrahym Sarmiento'), ('Lucas Kincaid');

INSERT INTO ams (name) VALUES
  ('Alejandro Bernis'), ('Alejandro Ricci'), ('Axel Alvez'),
  ('Facundo Baccile'), ('Ibrahym Sarmiento'), ('Lucas Kincaid');

INSERT INTO qa_ams (name) VALUES
  ('Alejandro Bernis'), ('Alejandro Ricci'), ('Axel Alvez'),
  ('Facundo Baccile'), ('Ibrahym Sarmiento'), ('Lucas Kincaid');

INSERT INTO formats (name) VALUES
  ('CTV'), ('Display'), ('High Impact'), ('Native'), ('OLV');

INSERT INTO categories (name) VALUES
  ('Beauty'), ('Entertainment'), ('Food & Beverage'), ('Foreign Auto'),
  ('Government Agency'), ('Pharma'), ('Retail'), ('Telco');

INSERT INTO deals (name) VALUES
  ('AV'), ('Direct');
