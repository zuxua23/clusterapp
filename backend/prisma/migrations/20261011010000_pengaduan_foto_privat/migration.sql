-- Foto pengaduan jadi privat (diambil lewat GET /pengaduan/:id/foto).
UPDATE `tb_File` SET `publik` = false WHERE `id` IN (SELECT `fotoUrl` FROM `tb_Pengaduan` WHERE `fotoUrl` IS NOT NULL);
