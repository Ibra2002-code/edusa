/** Types de base pour l'application EDUSA */

export type Student = {
  id: string;
  name: string;
  classId: string;
  parentName: string;
  parentPhone: string;
  active: boolean;
};

export type Teacher = {
  id: string;
  name: string;
  email: string;
  phone: string;
  classIds: string[];
  active: boolean;
};

export type SchoolClass = {
  id: string;
  name: string;
  level: string;
  teacherId: string | null;
};

/** Un appel enregistré : la source unique partagée par l'enseignant et l'administrateur. */
export type AttendanceSession = {
  id: string;
  classId: string;
  teacherId: string | null;
  /** ISO yyyy-mm-dd */
  date: string;
  time: string;
  presentIds: string[];
  absentIds: string[];
  notified: boolean;
};

export type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  time: string;
  tone: "info" | "absence" | "success";
};

// --- Configuration de l'établissement ---

export const school = {
  name: "École Al-Hikma",
  city: "Djibouti",
  address: "Quartier Héron, Avenue 13 — Djibouti-Ville",
  phone: "+253 21 35 40 12",
  year: "Année scolaire 2025 — 2026",
};

export const admin = {
  name: "Fatouma Ali Robleh",
  email: "direction@alhikma.edu",
};

// --- Données des Classes ---

export const classes: SchoolClass[] = [
  { id: "c5a", name: "5ème A", level: "Primaire", teacherId: "t1" },
  { id: "c6a", name: "6ème A", level: "Primaire", teacherId: "t1" },
  { id: "c7a", name: "7ème A", level: "Collège", teacherId: "t2" },
  { id: "c8a", name: "8ème A", level: "Collège", teacherId: "t3" },
  { id: "c9a", name: "9ème A", level: "Collège", teacherId: null },
];

// --- Données des Enseignants ---

export const teachers: Teacher[] = [
  {
    id: "t1",
    name: "Amina Abdirahman",
    email: "amina.abdirahman@alhikma.edu",
    phone: "+253 77 20 44 15",
    classIds: ["c5a", "c6a"],
    active: true,
  },
  {
    id: "t2",
    name: "Yusuf Warsame",
    email: "yusuf.warsame@alhikma.edu",
    phone: "+253 77 61 08 92",
    classIds: ["c7a"],
    active: true,
  },
  {
    id: "t3",
    name: "Hodan Farah",
    email: "hodan.farah@alhikma.edu",
    phone: "+253 77 34 77 20",
    classIds: ["c8a"],
    active: true,
  },
  {
    id: "t4",
    name: "Cabdi Nuur Jaamac",
    email: "cabdi.jaamac@alhikma.edu",
    phone: "+253 77 88 41 06",
    classIds: [],
    active: false,
  },
];

// --- Données des Élèves ---

const raw: [string, string, string, string][] = [
  ["Ayaan Mohamed Ali", "c5a", "Mohamed Ali Hersi", "+253 77 41 22 08"],
  ["Ibrahim Hassan Nour", "c5a", "Hassan Nour Ahmed", "+253 77 63 19 45"],
  ["Sagal Omar Duale", "c5a", "Omar Duale Egal", "+253 77 88 02 31"],
  ["Khadija Abdi Samatar", "c5a", "Abdi Samatar Ali", "+253 77 24 77 60"],
  ["Liban Ahmed Guelleh", "c5a", "Ahmed Guelleh Aden", "+253 77 55 90 12"],
  ["Naima Ismail Djama", "c6a", "Ismail Djama Robleh", "+253 77 31 46 78"],
  ["Abdirahman Said Barre", "c6a", "Said Barre Osman", "+253 77 19 83 24"],
  ["Fartuun Ali Waberi", "c6a", "Ali Waberi Hared", "+253 77 70 15 93"],
  ["Mustafe Yonis Kadir", "c6a", "Yonis Kadir Farah", "+253 77 47 38 51"],
  ["Hani Abdillahi Moussa", "c6a", "Abdillahi Moussa Idriss", "+253 77 92 60 17"],
  ["Zakaria Elmi Hared", "c7a", "Elmi Hared Aden", "+253 77 12 74 39"],
  ["Ubah Mahamoud Ismail", "c7a", "Mahamoud Ismail Cheik", "+253 77 66 21 84"],
  ["Bilal Osman Farah", "c7a", "Osman Farah Doualeh", "+253 77 38 09 76"],
  ["Iqra Hussein Aden", "c7a", "Hussein Aden Robleh", "+253 77 84 53 20"],
  ["Deeqa Warsame Nur", "c7a", "Warsame Nur Ismail", "+253 77 05 68 47"],
  ["Mohamed Idriss Bourhan", "c8a", "Idriss Bourhan Ali", "+253 77 73 41 05"],
  ["Salma Kayad Hersi", "c8a", "Kayad Hersi Omar", "+253 77 29 87 63"],
  ["Anwar Djama Robleh", "c8a", "Djama Robleh Wais", "+253 77 51 30 98"],
  ["Fadumo Abdourahman Ali", "c8a", "Abdourahman Ali Guedi", "+253 77 60 12 74"],
  ["Ayanle Hersi Egal", "c9a", "Hersi Egal Dini", "+253 77 45 26 81"],
  ["Nasteho Cabdi Rashid", "c9a", "Cabdi Rashid Hassan", "+253 77 17 59 32"],
  ["Suleiman Ahmed Wais", "c9a", "Ahmed Wais Farah", "+253 77 98 04 56"],
  ["Halima Mouse Ibrahim", "c9a", "Mouse Ibrahim Kamil", "+253 77 36 71 29"],
];

export const students: Student[] = raw.map(([name, classId, parentName, parentPhone], i) => ({
  id: `s${i + 1}`,
  name,
  classId,
  parentName,
  parentPhone,
  active: i !== 21,
}));

// --- Fonctions Utilitaires de Date ---

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

export const todayISO = () => iso(new Date());

export const formatToday = () =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

export const formatDateFr = (isoDate: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));

// --- Gestion des Sessions d'Appel ---

const rosterOf = (classId: string) => students.filter((s) => s.classId === classId).map((s) => s.id);

const makeSession = (
  id: string,
  classId: string,
  teacherId: string | null,
  date: string,
  time: string,
  absentIds: string[],
): AttendanceSession => ({
  id,
  classId,
  teacherId,
  date,
  time,
  absentIds,
  presentIds: rosterOf(classId).filter((s) => !absentIds.includes(s)),
  notified: absentIds.length > 0,
});

export const attendanceSessions: AttendanceSession[] = [
  makeSession("h1", "c5a", "t1", dayBefore(1), "08:10", ["s2", "s3"]),
  makeSession("h2", "c6a", "t1", dayBefore(1), "08:05", ["s8"]),
  makeSession("h3", "c7a", "t2", dayBefore(1), "08:15", ["s11"]),
  makeSession("h4", "c8a", "t3", dayBefore(1), "08:20", []),
  makeSession("h5", "c5a", "t1", dayBefore(2), "08:08", ["s2"]),
  makeSession("h6", "c6a", "t1", dayBefore(2), "08:02", []),
  makeSession("h7", "c7a", "t2", dayBefore(2), "08:12", ["s11", "s14"]),
  makeSession("h8", "c5a", "t1", dayBefore(3), "08:11", ["s2", "s3"]),
  makeSession("h9", "c8a", "t3", dayBefore(3), "08:18", ["s16"]),
  makeSession("h10", "c5a", "t1", dayBefore(4), "08:09", ["s3"]),
  makeSession("h11", "c7a", "t2", dayBefore(4), "08:14", ["s11"]),
  makeSession("h12", "c9a", null, dayBefore(4), "08:25", ["s20"]),
  makeSession("h13", "c5a", "t1", todayISO(), "08:10", ["s2"]),
  makeSession("h14", "c7a", "t2", todayISO(), "08:15", ["s13"]),
  makeSession("h15", "c8a", "t3", todayISO(), "08:05", ["s17"]),
];

// --- Activité Récente (pour le dashboard Admin) ---

export const recentActivity: ActivityItem[] = [
  {
    id: "a1",
    label: "Appel effectué en 5ème A",
    detail: "Mme Amina a marqué 1 élève absent.",
    time: "08:10",
    tone: "success",
  },
  {
    id: "a2",
    label: "Absence signalée",
    detail: "Ibrahim Hassan Nour est absent en 5ème A.",
    time: "08:12",
    tone: "absence",
  },
  {
    id: "a3",
    label: "Notification envoyée",
    detail: "Parent de Ibrahim Hassan Nour notifié par WhatsApp.",
    time: "08:15",
    tone: "info",
  },
  {
    id: "a4",
    label: "Nouvel enseignant",
    detail: "Cabdi Nuur Jaamac a été ajouté à la base de données.",
    time: "Hier",
    tone: "info",
  },
];

// --- Simulation d'authentification ---

export const currentTeacherId = "t1";

// Helper pour récupérer l'enseignant actuel
export const getCurrentTeacher = () => teachers.find(t => t.id === currentTeacherId);

// Helper pour récupérer les élèves d'une classe spécifique
export const getStudentsOfClass = (classId: string) => students.filter(s => s.classId === classId);