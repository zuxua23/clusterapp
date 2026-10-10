import {
  Area,
  KategoriPengaduan,
  PrismaClient,
  RT,
  StatusPembayaran,
  StatusPengaduan,
  StatusPengajuan,
  StatusRumah,
  TipeKas,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Buffer } from 'node:buffer';
import { MATRIX, PERMISSIONS, ROLES } from './rbac-data';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// Password default hanya untuk development; di production wajib diisi lewat env.
function passwordSeed(env: string, dev: string) {
  const nilai = process.env[env];
  if (nilai) return nilai;
  if (process.env.NODE_ENV === 'production')
    throw new Error(`${env} wajib diisi untuk seed di production.`);
  return dev;
}
const PASSWORD_ADMIN = passwordSeed('SEED_PASSWORD_ADMIN', 'admin1234');
const PASSWORD_PENGURUS = passwordSeed('SEED_PASSWORD_PENGURUS', 'Pengurus@123');
const PASSWORD_WARGA = passwordSeed('SEED_PASSWORD_WARGA', 'warga123');

// 1. RBAC — role, permission, matriks. Idempotent; aman dijalankan ulang.
//    Setelah pertama kali di-seed, matriks diatur admin lewat menu; seed ini
//    tidak menimpa perubahan itu (hanya menambah yang belum ada).
// ============================================================
async function seedRbac() {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { kode: r.kode },
      update: {},
      create: { kode: r.kode, nama: r.nama, level: r.level, isSystem: true },
    });
  }

  for (const [menu, aksiMap] of Object.entries(PERMISSIONS)) {
    for (const [aksi, keterangan] of Object.entries(aksiMap)) {
      const kode = `${menu}.${aksi}`;
      await prisma.permission.upsert({
        where: { kode },
        update: { keterangan },
        create: { kode, menu, aksi, keterangan },
      });
    }
  }

  const roles = await prisma.role.findMany();
  const perms = await prisma.permission.findMany();
  const roleId = new Map(roles.map((r) => [r.kode, r.id]));
  const permId = new Map(perms.map((p) => [p.kode, p.id]));

  const grants: { roleId: number; permissionId: number; scope: 'ALL' | 'AREA' | 'OWN' }[] = [];
  for (const [kodeRole, list] of Object.entries(MATRIX)) {
    for (const [kode, scope] of list) {
      const p = permId.get(kode);
      if (!p) throw new Error(`Permission "${kode}" di MATRIX tidak ada di katalog PERMISSIONS`);
      grants.push({ roleId: roleId.get(kodeRole)!, permissionId: p, scope });
    }
  }
  await prisma.rolePermission.createMany({
    data: grants.map((g) => ({ ...g, createBy: 'seed' })),
    skipDuplicates: true,
  });

  // Permission yang sudah dipecah/diganti dan tidak lagi ada di PERMISSIONS — dihapus dari
  // DB juga (cascade menghapus baris tb_role_permission yang memakainya) supaya matriks di
  // menu Peran & Hak Akses tidak menampilkan permission mati. Aman dijalankan berkali-kali.
  const DEPRECATED_PERMISSIONS = [
    'pengaduan.create', // dipecah jadi pengaduan.create_rw / pengaduan.create_rt (Bagian 2)
  ];
  const dihapus = await prisma.permission.deleteMany({
    where: { kode: { in: DEPRECATED_PERMISSIONS } },
  });
  if (dihapus.count > 0) {
    console.log(`🧹 Menghapus ${dihapus.count} permission lama yang sudah digantikan.`);
  }

  console.log(
    `✅ RBAC: ${roles.length} role, ${perms.length} permission, ${grants.length} aturan akses`,
  );
  return roleId;
}

// ============================================================
// 2. Dummy data
// ============================================================

const hash = (p: string) => bcrypt.hash(p, SALT_ROUNDS);
const pad = (n: number) => String(n).padStart(2, '0');

/** Gambar placeholder SVG (disimpan di tb_File) supaya halaman tidak menampilkan gambar rusak. */
async function buatSvg(nama: string, judul: string, warna: string, sub = '', publik = false) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${warna}"/>` +
    `<stop offset="1" stop-color="#0f172a"/></linearGradient></defs>` +
    `<rect width="800" height="500" fill="url(#g)"/>` +
    `<text x="400" y="240" font-family="Arial,sans-serif" font-size="38" font-weight="bold" fill="#fff" text-anchor="middle">${esc(judul)}</text>` +
    `<text x="400" y="290" font-family="Arial,sans-serif" font-size="22" fill="#e2e8f0" text-anchor="middle">${esc(sub || 'Cluster Topaz (data dummy)')}</text>` +
    `</svg>`;
  const data = Buffer.from(svg, 'utf-8');
  const file = await prisma.file.create({
    data: { namaAsli: nama, mimeType: 'image/svg+xml', ukuran: data.length, publik, data },
    select: { id: true },
  });
  return file.id;
}

interface WargaSeed {
  nama: string;
  blok: string;
}

interface RtSeed {
  rt: RT;
  n: number;
  ketua: string;
  bendahara: string;
  sekre: string;
  warga: string[];
  ipl: number;
  kas: number;
  kosong: number[]; // nomor rumah yang dibiarkan kosong
  /** pengurus RW yang tinggal di RT ini, di rumah no. 09 */
  rw?: { username: string; nama: string; role: 'KETUA_RW' | 'BENDAHARA_RW' | 'SEKRE_RW' };
}

// Tagihan tiap RT berbeda (sesuai wawancara): nominal IPL dan kas ditentukan bendahara RT masing-masing.
const RT_SEED: RtSeed[] = [
  {
    rt: 'RT_01', n: 1, ketua: 'Slamet Riyadi', bendahara: 'Sri Wahyuni', sekre: 'Agus Pratama',
    warga: ['Rina Marlina', 'Budi Santoso', 'Dewi Lestari', 'Ahmad Fauzi'],
    ipl: 130000, kas: 20000, kosong: [8, 10],
    rw: { username: 'ketua_rw', nama: 'Hendra Wijaya', role: 'KETUA_RW' },
  },
  {
    rt: 'RT_02', n: 2, ketua: 'Bambang Hermawan', bendahara: 'Nur Aini', sekre: 'Dedi Kurniawan',
    warga: ['Siti Rahmawati', 'Eko Prasetyo', 'Yuni Astuti', 'Rizky Ramadhan'],
    ipl: 125000, kas: 15000, kosong: [8, 10],
    rw: { username: 'bendahara_rw', nama: 'Maria Ulfa', role: 'BENDAHARA_RW' },
  },
  {
    rt: 'RT_03', n: 3, ketua: 'Teguh Santoso', bendahara: 'Lilis Suryani', sekre: 'Andi Wijaya',
    warga: ['Wahyu Hidayat', 'Fitri Handayani', 'Joko Susilo', 'Ratna Sari'],
    ipl: 140000, kas: 25000, kosong: [8, 10],
    rw: { username: 'sekre_rw', nama: 'Ferry Setiawan', role: 'SEKRE_RW' },
  },
  {
    rt: 'RT_04', n: 4, ketua: 'Hari Purnomo', bendahara: 'Endang Sulastri', sekre: 'Irfan Maulana',
    warga: ['Tono Sutrisno', 'Mira Kusuma', 'Danu Saputra', 'Lia Anggraini'],
    ipl: 130000, kas: 10000, kosong: [8, 9, 10],
  },
];

const blokOf = (n: number, no: number) => `E${n}/${pad(no)}`;
const telpOf = (n: number, no: number) => `0812345${n}${pad(no)}`;

async function seedDummy(roleId: Map<string, number>) {
  console.log('\n🌱 Membuat data dummy...');
  const now = new Date();
  const pwPengurus = await hash(PASSWORD_PENGURUS);
  const pwWarga = await hash(PASSWORD_WARGA);

  // ---------- Akun ----------
  await prisma.user.create({
    data: {
      namaUser: 'Administrator',
      username: 'admin',
      email: 'admin@gmail.com',
      password: await hash(PASSWORD_ADMIN),
      roleId: roleId.get('ADMIN')!,
      area: null,
    },
  });

  const userByUsername = new Map<string, number>();
  const rumahIds: Record<string, number> = {}; // "RT_01|E1/04" -> id rumah
  const kredensial: string[][] = [['admin', PASSWORD_ADMIN, 'Admin', '-']];

  const buatUser = async (data: {
    nama: string;
    username: string;
    role: string;
    area: Area;
    telp: string;
    password: string;
    email?: string;
  }) => {
    const u = await prisma.user.create({
      data: {
        namaUser: data.nama,
        username: data.username,
        email: data.email ?? null,
        noTelp: data.telp,
        password: data.password,
        roleId: roleId.get(data.role)!,
        area: data.area,
      },
    });
    userByUsername.set(data.username, u.id);
    return u.id;
  };

  const buatRumah = async (rt: RT, n: number, no: number, userId: number | null, status: StatusRumah) => {
    const r = await prisma.rumah.create({
      data: { rt, blokRumah: blokOf(n, no), userId, status, createBy: 'seed' },
    });
    rumahIds[`${rt}|${blokOf(n, no)}`] = r.id;
    return r.id;
  };

  for (const t of RT_SEED) {
    // Pengurus RT (juga warga: masing-masing menempati rumah)
    const pengurus: [string, string, string][] = [
      [t.ketua, `ketua_rt${t.n}`, 'KETUA_RT'],
      [t.bendahara, `bendahara_rt${t.n}`, 'BENDAHARA_RT'],
      [t.sekre, `sekre_rt${t.n}`, 'SEKRE_RT'],
    ];
    let no = 1;
    for (const [nama, username, role] of pengurus) {
      const id = await buatUser({ nama, username, role, area: t.rt, telp: telpOf(t.n, no), password: pwPengurus });
      await buatRumah(t.rt, t.n, no, id, 'DIHUNI_TETAP');
      kredensial.push([username, PASSWORD_PENGURUS, role.replace('_', ' '), t.rt.replace('_', ' ')]);
      no++;
    }

    // Warga biasa
    for (const nama of t.warga) {
      const telp = telpOf(t.n, no);
      const id = await buatUser({ nama, username: telp, role: 'WARGA', area: t.rt, telp, password: pwWarga });
      await buatRumah(t.rt, t.n, no, id, 'DIHUNI_TETAP');
      kredensial.push([telp, PASSWORD_WARGA, 'Warga', `${t.rt.replace('_', ' ')} (${nama})`]);
      no++;
    }

    // Rumah no. 08-10: kosong, atau dihuni pengurus RW
    for (const kosong of [8, 9, 10]) {
      if (kosong === 9 && t.rw) {
        const telp = telpOf(t.n, 9);
        const id = await buatUser({
          nama: t.rw.nama, username: t.rw.username, role: t.rw.role, area: 'RW', telp, password: pwPengurus,
        });
        await buatRumah(t.rt, t.n, 9, id, 'DIHUNI_TETAP');
        kredensial.push([t.rw.username, PASSWORD_PENGURUS, t.rw.role.replace('_', ' '), 'RW']);
      } else if (t.kosong.includes(kosong)) {
        await buatRumah(t.rt, t.n, kosong, null, 'KOSONG');
      }
    }
  }

  // Satu warga punya 2 rumah: E1/11 dikontrakkan (penanda "kontrak" vs "tetap")
  const budi = userByUsername.get(telpOf(1, 5))!; // Budi Santoso, warga ke-2 di RT1
  await buatRumah('RT_01', 1, 11, budi, 'DIHUNI_KONTRAK');

  console.log(`   ✔ ${userByUsername.size + 1} akun, ${Object.keys(rumahIds).length} rumah`);

  // ---------- Tagihan IPL: 3 bulan terakhir, nominal beda per RT ----------
  const bulanList = [2, 1, 0].map((mundur) => {
    const d = new Date(now.getFullYear(), now.getMonth() - mundur, 1);
    return { bulan: pad(d.getMonth() + 1), tahun: String(d.getFullYear()), awal: d };
  });

  // Bukti bayar dummy (SVG di tb_File, tidak publik). Satu file dipakai bersama pembayaran dan setoran.
  const buktiBayar = await buatSvg('dummy-bukti-bayar.svg', 'Bukti Transfer IPL', '#0f766e', 'Data dummy');
  const buktiSetoran = await buatSvg('dummy-bukti-setoran.svg', 'Bukti Setoran IPL RT ke RW', '#1d4ed8', 'Data dummy');

  type Tagihan = { id: number; rt: RT; k: number; status: StatusPembayaran; nominalIpl: number };
  const semuaTagihan: Tagihan[] = [];

  for (const t of RT_SEED) {
    const rumahRt = await prisma.rumah.findMany({
      where: { rt: t.rt, userId: { not: null } },
      orderBy: { id: 'asc' },
    });

    for (let k = 0; k < bulanList.length; k++) {
      const b = bulanList[k];
      for (let i = 0; i < rumahRt.length; i++) {
        const r = rumahRt[i];
        let status: StatusPembayaran;
        if (k === 0) status = i % 9 === 5 ? 'BELUM_LUNAS' : 'LUNAS';
        else if (k === 1) status = i % 6 === 2 ? 'MENUNGGU_KONFIRMASI' : i % 7 === 4 ? 'BELUM_LUNAS' : 'LUNAS';
        else status = i % 2 === 0 ? 'LUNAS' : i % 5 === 1 ? 'MENUNGGU_KONFIRMASI' : 'BELUM_LUNAS';

        const ipl = await prisma.ipl.create({
          data: {
            idRumah: r.id,
            bulanPeriode: b.bulan,
            tahunPeriode: b.tahun,
            nominalIpl: t.ipl,
            nominalKas: t.kas,
            statusPembayaran: status,
          },
        });
        semuaTagihan.push({ id: ipl.id, rt: t.rt, k, status, nominalIpl: t.ipl });

        if (status !== 'BELUM_LUNAS' && r.userId) {
          const bayar = new Date(b.awal.getFullYear(), b.awal.getMonth(), 3 + (i % 15), 10, 0);
          await prisma.pembayaranIpl.create({
            data: {
              idUser: r.userId,
              idIpl: ipl.id,
              tanggalBayar: bayar,
              tanggalKonfirmasi:
                status === 'LUNAS' ? new Date(bayar.getTime() + 24 * 3600 * 1000) : null,
              buktiTransaksi: buktiBayar,
              nominal: t.ipl + t.kas,
            },
          });
        }
      }
    }
  }
  console.log(`   ✔ ${semuaTagihan.length} tagihan IPL (3 bulan × 4 RT, nominal berbeda per RT)`);

  // ---------- Setoran RT -> RW ----------
  const konfirmator = 'Maria Ulfa';
  const ambil = (rt: RT, ks: number[]) =>
    semuaTagihan.filter((x) => x.rt === rt && x.status === 'LUNAS' && ks.includes(x.k));

  const buatSetoran = async (
    rt: RT,
    tagihan: Tagihan[],
    status: 'DIKONFIRMASI' | 'MENUNGGU_KONFIRMASI' | 'DITOLAK',
    hariLalu: number,
    catatan?: string,
    tautkan = true,
  ) => {
    const tgl = new Date(now.getTime() - hariLalu * 24 * 3600 * 1000);
    const s = await prisma.setoranIpl.create({
      data: {
        area: rt,
        totalIpl: tagihan.reduce((a, x) => a + x.nominalIpl, 0),
        jumlahTagihan: tagihan.length,
        buktiTransaksi: buktiSetoran,
        status,
        catatan: catatan ?? null,
        createBy: RT_SEED.find((x) => x.rt === rt)!.bendahara,
        createDate: tgl,
        konfirmasiBy: status === 'MENUNGGU_KONFIRMASI' ? null : konfirmator,
        tanggalKonfirmasi:
          status === 'MENUNGGU_KONFIRMASI' ? null : new Date(tgl.getTime() + 2 * 24 * 3600 * 1000),
      },
    });
    if (tautkan && tagihan.length) {
      await prisma.ipl.updateMany({
        where: { id: { in: tagihan.map((x) => x.id) } },
        data: { setoranId: s.id },
      });
    }
  };

  // RT1: dua bulan pertama sudah disetor & dikonfirmasi; bulan berjalan belum (siap disetor)
  await buatSetoran('RT_01', ambil('RT_01', [0, 1]), 'DIKONFIRMASI', 25);
  // RT2: bulan pertama dikonfirmasi, bulan kedua masih menunggu konfirmasi RW
  await buatSetoran('RT_02', ambil('RT_02', [0]), 'DIKONFIRMASI', 40);
  await buatSetoran('RT_02', ambil('RT_02', [1]), 'MENUNGGU_KONFIRMASI', 3);
  // RT3: pernah ditolak; tagihannya kembali ke antrean setor berikutnya
  await buatSetoran('RT_03', ambil('RT_03', [0]), 'DITOLAK', 20, 'Nominal pada bukti transfer tidak sesuai total IPL.', false);
  // RT4: belum pernah menyetor
  console.log('   ✔ 4 setoran (dikonfirmasi, menunggu, ditolak) + RT4 belum menyetor');

  // ---------- Kas manual per area ----------
  const tgl = (mundurBulan: number, hari: number) =>
    new Date(now.getFullYear(), now.getMonth() - mundurBulan, hari, 9, 0);
  const kas: [Area, TipeKas, string, number, Date, string][] = [
    ['RW', 'PEMASUKAN', 'Donasi', 5000000, tgl(2, 5), 'Donasi warga untuk perayaan 17 Agustus'],
    ['RW', 'PENGELUARAN', 'Gaji Keamanan', 1500000, tgl(2, 28), 'Honor petugas keamanan bulan lalu'],
    ['RW', 'PENGELUARAN', 'Kebersihan', 600000, tgl(1, 27), 'Honor petugas kebersihan'],
    ['RW', 'PENGELUARAN', 'Perbaikan Fasilitas', 750000, tgl(1, 12), 'Perbaikan gerbang cluster'],
    ['RW', 'PENGELUARAN', 'Gaji Keamanan', 1500000, tgl(0, 2), 'Honor petugas keamanan'],
    ['RT_01', 'PENGELUARAN', 'Konsumsi Rapat', 350000, tgl(1, 8), 'Konsumsi rapat RT 01'],
    ['RT_01', 'PENGELUARAN', 'Perbaikan Lampu', 275000, tgl(0, 6), 'Ganti lampu jalan blok E1'],
    ['RT_01', 'PEMASUKAN', 'Sumbangan Acara', 500000, tgl(0, 10), 'Sumbangan arisan RT'],
    ['RT_02', 'PENGELUARAN', 'Kebersihan', 400000, tgl(1, 15), 'Kerja bakti RT 02'],
    ['RT_02', 'PENGELUARAN', 'Konsumsi Rapat', 300000, tgl(0, 9), 'Konsumsi rapat RT 02'],
    ['RT_03', 'PENGELUARAN', 'Perbaikan Fasilitas', 650000, tgl(1, 20), 'Perbaikan saluran air blok E3'],
    ['RT_03', 'PEMASUKAN', 'Sumbangan Acara', 750000, tgl(0, 4), 'Sumbangan jalan sehat'],
    ['RT_04', 'PENGELUARAN', 'Konsumsi Rapat', 250000, tgl(0, 7), 'Konsumsi rapat RT 04'],
  ];
  for (const [area, tipe, kategori, nominal, tanggal, keterangan] of kas) {
    await prisma.kasTransaksi.create({
      data: { area, tipe, kategori, nominal, tanggal, keterangan, createBy: 'seed' },
    });
  }
  console.log(`   ✔ ${kas.length} transaksi kas manual`);

  // ---------- Kegiatan: 5 tahun (portofolio landing) + kegiatan per RT ----------
  const thn = now.getFullYear();
  const hariIni = (plus: number) => new Date(now.getTime() + plus * 24 * 3600 * 1000);
  let gambarNo = 0;
  const gambar = (judul: string, warna: string) =>
    buatSvg(`dummy-kegiatan-${pad(++gambarNo)}.svg`, judul, warna, 'Cluster Topaz', true);

  type K = {
    judul: string; deskripsi: string; tanggal: Date; area: Area; warna: string;
    pengajuan?: StatusPengajuan; alasan?: string; landing?: boolean; tampilSampai?: Date | null;
  };
  const kegiatan: K[] = [
    { judul: 'Peringatan HUT RI ke-77', deskripsi: 'Lomba dan upacara bendera bersama seluruh warga cluster.', tanggal: new Date(thn - 4, 7, 17), area: 'RW', warna: '#dc2626', landing: true },
    { judul: 'Kerja Bakti Massal Cluster', deskripsi: 'Pembersihan saluran air dan taman seluruh blok.', tanggal: new Date(thn - 3, 2, 12), area: 'RW', warna: '#16a34a', landing: true },
    { judul: 'Bazar Ramadan', deskripsi: 'Bazar takjil dan santunan anak yatim di lapangan cluster.', tanggal: new Date(thn - 3, 3, 8), area: 'RW', warna: '#ca8a04', landing: true },
    { judul: 'Turnamen Futsal Antar RT', deskripsi: 'Turnamen tahunan antar empat RT, juara umum RT 03.', tanggal: new Date(thn - 2, 5, 22), area: 'RW', warna: '#2563eb', landing: true },
    { judul: 'Pengajian Akbar & Santunan', deskripsi: 'Pengajian akbar dihadiri lebih dari 300 warga.', tanggal: new Date(thn - 2, 9, 4), area: 'RW', warna: '#7c3aed', landing: true },
    { judul: 'Pemasangan CCTV Cluster', deskripsi: 'Pemasangan 24 titik CCTV di gerbang dan jalan utama.', tanggal: new Date(thn - 1, 1, 15), area: 'RW', warna: '#0f766e', landing: true },
    { judul: 'Malam Tirakatan Kemerdekaan', deskripsi: 'Tirakatan dan pentas seni warga.', tanggal: new Date(thn - 1, 7, 16), area: 'RW', warna: '#be123c', landing: true },
    { judul: 'Senam Sehat Bersama', deskripsi: 'Senam pagi bersama tiap Minggu di lapangan cluster.', tanggal: new Date(thn, 2, 9), area: 'RW', warna: '#ea580c', landing: true },
    { judul: 'Lomba 17 Agustus', deskripsi: 'Lomba anak-anak dan bapak-ibu memeriahkan kemerdekaan.', tanggal: new Date(thn, 7, 17), area: 'RW', warna: '#dc2626', landing: true },
    { judul: 'Rapat Warga Tahunan', deskripsi: 'Pemaparan laporan keuangan dan program kerja RW.', tanggal: hariIni(12), area: 'RW', warna: '#0369a1', landing: false, tampilSampai: hariIni(20) },
    { judul: 'Donor Darah Cluster', deskripsi: 'Bekerja sama dengan PMI, terbuka untuk seluruh warga.', tanggal: hariIni(27), area: 'RW', warna: '#b91c1c', landing: false, tampilSampai: null },
    // Contoh tiap status pengajuan dari RT
    { judul: 'Arisan Ibu-Ibu RT 01', deskripsi: 'Arisan bulanan khusus warga RT 01.', tanggal: hariIni(7), area: 'RT_01', warna: '#0d9488', pengajuan: 'TIDAK' },
    { judul: 'Kerja Bakti RT 02', deskripsi: 'Kerja bakti membersihkan selokan blok E2. Diajukan agar diikuti seluruh warga.', tanggal: hariIni(9), area: 'RT_02', warna: '#65a30d', pengajuan: 'DIAJUKAN' },
    { judul: 'Jalan Sehat RT 03', deskripsi: 'Jalan sehat keliling cluster, terbuka untuk seluruh warga.', tanggal: hariIni(14), area: 'RT_03', warna: '#0891b2', pengajuan: 'DISETUJUI', tampilSampai: hariIni(14) },
    { judul: 'Bazar Kuliner RT 04', deskripsi: 'Bazar kuliner warga RT 04.', tanggal: hariIni(16), area: 'RT_04', warna: '#c026d3', pengajuan: 'DITOLAK', alasan: 'Jadwal bentrok dengan Rapat Warga Tahunan. Mohon ajukan di tanggal lain.' },
  ];
  for (const k of kegiatan) {
    await prisma.kegiatan.create({
      data: {
        judul: k.judul,
        deskripsi: k.deskripsi,
        tanggalAcara: k.tanggal,
        gambarUrl: await gambar(k.judul, k.warna),
        status: 'active',
        area: k.area,
        statusPengajuan: k.pengajuan ?? 'TIDAK',
        alasanTolak: k.alasan ?? null,
        tampilDiLanding: k.landing ?? false,
        tampilSampai: k.tampilSampai ?? null,
        createBy: k.area === 'RW' ? 'Ferry Setiawan' : RT_SEED.find((x) => x.rt === k.area)!.sekre,
      },
    });
  }
  console.log(`   ✔ ${kegiatan.length} kegiatan (9 portofolio 5 tahun, 2 mendatang, 4 dari RT)`);

  // ---------- Pengumuman ----------
  type P = { judul: string; isi: string; area: Area; pengajuan?: StatusPengajuan; alasan?: string; sampai?: Date | null; status?: 'active' | 'unactived' };
  const pengumuman: P[] = [
    { judul: 'Jadwal Pengangkutan Sampah Terbaru', isi: 'Mulai bulan ini sampah diangkut Senin, Rabu, dan Sabtu pukul 06.00. Mohon sampah sudah di depan rumah sebelum jam tersebut.', area: 'RW', sampai: hariIni(30) },
    { judul: 'Pemeliharaan Jaringan Listrik', isi: 'Akan ada pemadaman listrik terjadwal hari Minggu pukul 09.00-12.00 untuk pemeliharaan trafo.', area: 'RW', sampai: hariIni(10) },
    { judul: 'Pembatasan Kendaraan Berat', isi: 'Kendaraan berat dilarang masuk cluster pada jam 06.00-18.00 demi keamanan anak-anak.', area: 'RW', status: 'unactived' },
    { judul: 'Iuran Kas RT 01 Disesuaikan', isi: 'Kas RT 01 disesuaikan menjadi Rp 20.000 per bulan, hasil kesepakatan rapat RT.', area: 'RT_01', pengajuan: 'TIDAK' },
    { judul: 'Pemeliharaan Pompa Air Blok E2', isi: 'Air blok E2 mati sementara Sabtu 08.00-11.00. Diajukan ke RW karena berdampak ke warga sekitar.', area: 'RT_02', pengajuan: 'DIAJUKAN' },
    { judul: 'Jadwal Ronda Malam RT 03', isi: 'Jadwal ronda malam RT 03 bulan ini sudah dibagikan. Cek grup RT.', area: 'RT_03', pengajuan: 'DISETUJUI', sampai: hariIni(14) },
    { judul: 'Penutupan Portal Blok E4', isi: 'Portal blok E4 ditutup pukul 22.00.', area: 'RT_04', pengajuan: 'DITOLAK', alasan: 'Kebijakan portal diatur RW dan perlu dibahas di rapat pengurus.' },
  ];
  for (const p of pengumuman) {
    await prisma.pengumuman.create({
      data: {
        judul: p.judul,
        keteranganPengumuman: p.isi,
        status: p.status ?? 'active',
        area: p.area,
        statusPengajuan: p.pengajuan ?? 'TIDAK',
        alasanTolak: p.alasan ?? null,
        tampilSampai: p.sampai ?? null,
        createBy: p.area === 'RW' ? 'Ferry Setiawan' : RT_SEED.find((x) => x.rt === p.area)!.sekre,
      },
    });
  }
  console.log(`   ✔ ${pengumuman.length} pengumuman`);

  // ---------- Pengaduan ----------
  const pengaduan: [string, string, KategoriPengaduan, string, StatusPengaduan, string | null, Area][] = [
    [telpOf(1, 4), 'Lampu jalan blok E1 mati', 'INFRASTRUKTUR', 'Lampu jalan di depan E1/06 sudah dua minggu mati sehingga gelap saat malam.', 'MENUNGGU', null, 'RT_01'],
    [telpOf(1, 6), 'Sampah menumpuk di ujung jalan', 'KEBERSIHAN', 'Sampah di ujung blok E1 belum diangkut sejak Sabtu.', 'DIPROSES', 'Sudah dikoordinasikan dengan petugas kebersihan, diangkut besok pagi.', 'RW'],
    [telpOf(2, 5), 'Motor asing parkir lama di blok E2', 'KEAMANAN', 'Ada motor tidak dikenal parkir dua hari di depan E2/05.', 'SELESAI', 'Sudah dicek satpam, milik tamu warga yang menginap. Terima kasih laporannya.', 'RT_02'],
    [telpOf(2, 7), 'Air PAM sering mati', 'INFRASTRUKTUR', 'Air mati hampir tiap sore sejak minggu lalu.', 'MENUNGGU', null, 'RW'],
    [telpOf(3, 4), 'Suara musik hingga larut malam', 'LAINNYA', 'Tetangga blok E3 memutar musik keras sampai lewat tengah malam.', 'DITOLAK', 'Sudah ditegur langsung; mohon selesaikan secara kekeluargaan lebih dulu.', 'RT_03'],
    [telpOf(4, 5), 'Got tersumbat depan E4/05', 'KEBERSIHAN', 'Got tersumbat dan menimbulkan bau serta genangan air.', 'DIPROSES', 'Dijadwalkan kerja bakti hari Minggu.', 'RT_04'],
  ];
  for (const [username, judul, kategori, deskripsi, status, tanggapan, tujuan] of pengaduan) {
    await prisma.pengaduan.create({
      data: {
        idUser: userByUsername.get(username)!,
        judul, kategori, deskripsi, status, tanggapan, tujuan,
        tanggapanBy: tanggapan ? 'Pengurus' : null,
        updatedAt: tanggapan ? new Date() : null,
      },
    });
  }
  console.log(`   ✔ ${pengaduan.length} pengaduan`);

  // ---------- Catatan rapat: area RW dan tiap RT terpisah ----------
  const catatan: [Area, string, string, string][] = [
    ['RW', 'Rapat Pengurus RW - Evaluasi Keamanan', 'Hadir: ketua, bendahara, sekretaris RW dan ketua RT 1-4.\n1. CCTV titik ke-12 rusak, diperbaiki bulan ini.\n2. Jam patroli satpam ditambah pukul 01.00.\n3. Rencana rapat warga tahunan bulan depan.', 'Ferry Setiawan'],
    ['RW', 'Rapat Pengurus RW - Persiapan 17 Agustus', 'Anggaran perayaan Rp 5.000.000 dari kas RW dan donasi. Panitia diketuai perwakilan RT 03.', 'Ferry Setiawan'],
    ['RT_01', 'Rapat RT 01 - Penyesuaian Kas', 'Kas RT 01 disepakati Rp 20.000 per bulan untuk operasional lampu jalan dan kebersihan.', 'Agus Pratama'],
    ['RT_01', 'Rapat RT 01 - Jadwal Ronda', 'Jadwal ronda disusun ulang, 4 kelompok bergantian tiap malam.', 'Agus Pratama'],
    ['RT_02', 'Rapat RT 02 - Air Bersih', 'Keluhan air PAM disampaikan ke pengurus RW untuk diteruskan ke pengelola.', 'Dedi Kurniawan'],
    ['RT_03', 'Rapat RT 03 - Jalan Sehat', 'Susunan panitia jalan sehat dan pembagian seksi konsumsi.', 'Andi Wijaya'],
    ['RT_04', 'Rapat RT 04 - Portal Blok E4', 'Usulan penutupan portal malam hari akan diajukan ke rapat pengurus RW.', 'Irfan Maulana'],
  ];
  for (const [area, judul, isiNotulen, by] of catatan) {
    await prisma.catatanRapat.create({ data: { area, judul, isiNotulen, createBy: by } });
  }
  console.log(`   ✔ ${catatan.length} catatan rapat`);

  // ---------- Ringkasan akun ----------
  console.log('\n🔑 Akun untuk masuk (nama pengguna / kata sandi):');
  console.table(
    kredensial
      .filter((_, i) => i === 0 || kredensial[i][2] !== 'Warga' || /\(Rina|\(Siti|\(Wahyu|\(Tono/.test(kredensial[i][3]))
      .map(([username, password, role, area]) => ({ 'nama pengguna': username, 'kata sandi': password, peran: role, wilayah: area })),
  );
  console.log(`   (warga lain memakai kata sandi "${PASSWORD_WARGA}", nama pengguna = no HP-nya)`);
}

async function main() {
  console.log('🌱 Memulai seed...\n');
  const roleId = await seedRbac();

  const sudahAda = await prisma.user.count();
  if (sudahAda > 0) {
    console.log(
      `\n⚠️  Sudah ada ${sudahAda} akun di database, data dummy dilewati.\n` +
        '   Untuk memulai dari nol: npx prisma migrate reset (menghapus SEMUA data).',
    );
  } else {
    await seedDummy(roleId);
  }
  console.log('\n✨ Seed selesai!');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
