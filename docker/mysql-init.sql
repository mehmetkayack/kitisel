-- Docker MySQL ilk kurulumu: uygulama kullanıcısı test ve e2e veritabanlarını da oluşturup silebilsin.
-- (Testler her çalıştırmada upvine_test veritabanını yeniden oluşturur.)
GRANT ALL PRIVILEGES ON `upvine%`.* TO 'upvine'@'%';
FLUSH PRIVILEGES;
