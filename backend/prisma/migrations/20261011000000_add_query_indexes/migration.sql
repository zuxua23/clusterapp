-- CreateIndex
CREATE INDEX `trx_IPL_tahun_periode_bulan_periode_status_pembayaran_idx` ON `trx_IPL`(`tahun_periode`, `bulan_periode`, `status_pembayaran`);

-- CreateIndex
CREATE INDEX `tb_Notifikasi_idUser_createdAt_idx` ON `tb_Notifikasi`(`idUser`, `createdAt`);

-- CreateIndex
CREATE INDEX `trx_kas_area_tanggal_idx` ON `trx_kas`(`area`, `tanggal`);

-- CreateIndex
CREATE INDEX `tb_AuditLog_created_at_idx` ON `tb_AuditLog`(`created_at`);
