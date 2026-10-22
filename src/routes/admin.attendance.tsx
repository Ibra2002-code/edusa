import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  ScanLine,
  School,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/attendance")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),

  head: () => ({
    meta: [
      { title: "Présences — EDUSA" },
      {
        name: "description",
        content:
          "Gérez les présences à partir des feuilles d'appel papier de l'établissement.",
      },
    ],
  }),

  component: AttendancePage,
});

type ClassView = {
  id: string;
  name: string;
  level: string | null;
  studentCount: number;
};

type StudentView = {
  id: string;
  student_number: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

function AttendancePage() {
  const supabaseClient = supabase as any;

  const [classes, setClasses] = useState<ClassView[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [recognitionDraft, setRecognitionDraft] = useState<Record<string, unknown> | null>(null);
  const [importingImage, setImportingImage] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [attendanceDate, setAttendanceDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    void loadClasses();
  }, []);

  async function loadClasses() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (!profile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const { data: classRows, error: classesError } = await supabaseClient
        .from("classes")
        .select("id, name, level")
        .eq("school_id", profile.school_id)
        .eq("active", true)
        .order("name");

      if (classesError) {
        throw classesError;
      }

      const { data: studentRows, error: studentsError } =
        await supabaseClient
          .from("students")
          .select("id, class_id")
          .eq("school_id", profile.school_id)
          .eq("active", true);

      if (studentsError) {
        throw studentsError;
      }

      const studentCountByClass = new Map<string, number>();

      for (const student of studentRows ?? []) {
        if (!student.class_id) {
          continue;
        }

        studentCountByClass.set(
          student.class_id,
          (studentCountByClass.get(student.class_id) ?? 0) + 1,
        );
      }

      const mappedClasses: ClassView[] = (classRows ?? []).map(
        (schoolClass: {
          id: string;
          name: string;
          level: string | null;
        }) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          level: schoolClass.level,
          studentCount: studentCountByClass.get(schoolClass.id) ?? 0,
        }),
      );

      setClasses(mappedClasses);

      if (mappedClasses.length === 0) {
        setSelectedClassId(null);
      }
    } catch (error) {
      console.error("[EDUSA Admin Attendance] load classes", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de charger les classes.",
      );

      setClasses([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectClass(classId: string) {
    setSelectedClassId(classId);
    setRecognitionDraft(null);
    setLoadingStudents(true);

    try {
      // Resolve the signed-in administrator's school so the roster query is
      // explicitly scoped to that school as well as the selected class.
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Utilisateur non authentifié.");
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (!profile?.school_id) {
        throw new Error("École administrateur introuvable.");
      }

      const { data: studentRows, error: studentsError } =
        await supabaseClient
          .from("students")
          .select(
            "id, student_number, first_name, middle_name, last_name",
          )
          .eq("school_id", profile.school_id)
          .eq("class_id", classId)
          .eq("active", true)
          .order("student_number")
          .order("last_name")
          .order("first_name");

      if (studentsError) {
        throw studentsError;
      }

      setStudents((studentRows ?? []) as StudentView[]);
    } catch (error) {
      console.error("[EDUSA Admin Attendance] load students", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de charger les élèves de la classe.",
      );

      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  async function openScanner() {
    setCameraError(null);
    setCapturedImage(null);
    setScannerOpen(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "La caméra n'est pas disponible dans ce navigateur. Vous pouvez importer une photo à la place.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (error) {
      console.error("[EDUSA Admin Attendance] camera access failed", error);
      setCameraError(
        "Impossible d'accéder à la caméra. Vérifiez l'autorisation du navigateur ou importez une photo.",
      );
    }
  }

  function closeScanner() {
    stopCamera();
    setScannerOpen(false);
    setCameraError(null);
    setCapturedImage(null);
    setImportingImage(false);
  }

  function captureImage() {
    const video = videoRef.current;

    if (!video || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      toast.error("Impossible de capturer l'image.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.92));
    stopCamera();
  }

  function retakeImage() {
    setCapturedImage(null);
    void startCameraAgain();
  }

  async function startCameraAgain() {
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (error) {
      console.error("[EDUSA Admin Attendance] camera restart failed", error);
      setCameraError(
        "Impossible de relancer la caméra. Vérifiez son autorisation dans le navigateur.",
      );
    }
  }

  function handleImportedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image.");
      event.target.value = "";
      return;
    }

    setImportingImage(true);
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        setCapturedImage(result);
        setScannerOpen(true);
        setImportingImage(false);
      }
    };

    reader.onerror = () => {
      setImportingImage(false);
      toast.error("Impossible de lire cette image.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function useCapturedImage() {
    if (!capturedImage || importingImage) {
      return;
    }

    setImportingImage(true);
    setRecognitionDraft(null);

    try {
      const { data, error } = await supabaseClient.functions.invoke(
        "recognize-attendance-sheet",
        {
          body: {
            image: capturedImage,
          },
        },
      );

      if (error) {
        let message = error.message || "La reconnaissance a échoué.";

        try {
          const details = await error.context?.json();
          if (typeof details?.error === "string") {
            message = details.error;
          }
        } catch {
          // Keep the original error message if the response is not JSON.
        }

        throw new Error(message);
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("La réponse de reconnaissance est invalide.");
      }

      if (typeof (data as Record<string, unknown>)["error"] === "string") {
        throw new Error((data as Record<string, string>)["error"]);
      }

      setRecognitionDraft(data as Record<string, unknown>);
      closeScanner();
      toast.success(
        "Reconnaissance terminée. Vérifiez le brouillon avant toute validation.",
      );
    } catch (error) {
      console.error("[EDUSA Admin Attendance] recognition failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de reconnaître la feuille d'appel.",
      );
    } finally {
      setImportingImage(false);
    }
  }

  function backToClasses() {
    setSelectedClassId(null);
    setStudents([]);
  }

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const selectedClassSubtitle = selectedClass
    ? `${selectedClass.studentCount} élève${
        selectedClass.studentCount > 1 ? "s" : ""
      }`
    : `${classes.length} classe${classes.length > 1 ? "s" : ""} active${
        classes.length > 1 ? "s" : ""
      }`;

  return (
    <AdminShell
      title="Présences"
      subtitle={
        selectedClass
          ? `${selectedClass.name} · ${selectedClassSubtitle}`
          : selectedClassSubtitle
      }
      actions={
        selectedClass ? (
          <Button
            variant="outline"
            onClick={backToClasses}
            disabled={loadingStudents}
          >
            Retour aux classes
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardContent className="flex min-h-[260px] items-center justify-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <span className="text-sm font-medium">
              Chargement des classes...
            </span>
          </CardContent>
        </Card>
      ) : selectedClass ? (
        <div className="space-y-6">
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className="border-teal-100 bg-teal-50 text-teal-700 hover:bg-teal-50">
                      {selectedClass.level ?? "Classe"}
                    </Badge>

                    <span className="text-sm text-slate-400">
                      {selectedClass.studentCount} élève
                      {selectedClass.studentCount > 1 ? "s" : ""}
                    </span>
                  </div>

                  <CardTitle className="text-2xl font-bold text-slate-900">
                    {selectedClass.name}
                  </CardTitle>

                  <p className="mt-1 text-sm text-slate-500">
                    Utilisez la feuille d'appel papier de cette classe pour
                    préparer les absences du jour.
                  </p>
                </div>

                <div className="w-full max-w-[220px]">
                  <Label
                    htmlFor="attendance-date"
                    className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500"
                  >
                    Date
                  </Label>

                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      id="attendance-date"
                      type="date"
                      value={attendanceDate}
                      onChange={(event) =>
                        setAttendanceDate(event.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm ring-1 ring-teal-100">
                      <ScanLine className="h-6 w-6" />
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900">
                        Scanner la feuille d'appel
                      </h3>

                      <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                        Scannez la feuille papier de cette classe. EDUSA
                        détectera les élèves marqués absents et préparera un
                        relevé à vérifier avant toute notification.
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      onClick={() => void openScanner()}
                      disabled={importingImage}
                      className="bg-teal-600 px-5 hover:bg-teal-700"
                    >
                      <ScanLine className="mr-2 h-4 w-4" />
                      Scanner la feuille
                    </Button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleImportedImage}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      disabled={importingImage}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Importer une photo
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-teal-700">
                  <CheckCircle2 className="h-4 w-4" />
                  La confirmation par l'administration sera toujours requise
                  avant l'envoi WhatsApp.
                </div>
              </div>
            </CardContent>
          </Card>

          {recognitionDraft && (
            <Card className="border-none shadow-sm ring-1 ring-amber-200">
              <CardHeader className="border-b border-amber-100 bg-amber-50/70">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="h-5 w-5 text-amber-700" />
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-900">
                      Brouillon de reconnaissance OCR
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-600">
                      Résultat proposé par l'IA pour vérification. Aucune présence
                      n'a été enregistrée et aucune notification WhatsApp n'a été envoyée.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {JSON.stringify(recognitionDraft, null, 2)}
                </pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRecognitionDraft(null)}
                  >
                    Fermer le brouillon
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">
                    Feuille de présence numérique
                  </CardTitle>

                  <p className="mt-1 text-sm text-slate-500">
                    Les résultats du scan apparaîtront ici pour vérification.
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className="hidden border-slate-200 text-slate-500 sm:inline-flex"
                >
                  Brouillon
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loadingStudents ? (
                <div className="flex min-h-[220px] items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                  <span className="text-sm font-medium">
                    Chargement des élèves...
                  </span>
                </div>
              ) : students.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
                  <Users className="mb-3 h-10 w-10 text-slate-300" />

                  <p className="font-semibold text-slate-700">
                    Aucun élève actif dans cette classe
                  </p>

                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    Importez ou affectez les élèves à cette classe avant de
                    commencer les présences.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-100 text-left">
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          N°
                        </th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Élève
                        </th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Matin
                        </th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Après-midi
                        </th>
                        <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                          Statut
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map((student) => {
                        const fullName = [
                          student.first_name,
                          student.middle_name,
                          student.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ")
                          .trim();

                        return (
                          <tr
                            key={student.id}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-500">
                              {student.student_number ?? "—"}
                            </td>

                            <td className="px-5 py-4 font-semibold text-slate-900">
                              {fullName || "Élève sans nom"}
                            </td>

                            <td className="px-5 py-4 text-slate-400">
                              —
                            </td>

                            <td className="px-5 py-4 text-slate-400">
                              —
                            </td>

                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className="border-slate-200 bg-slate-50 text-slate-500"
                              >
                                En attente du scan
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : classes.length === 0 ? (
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardContent className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <School className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Aucune classe configurée
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              Configurez d'abord les classes de l'établissement avant de
              gérer les présences.
            </p>

            <Button
              asChild
              className="mt-5 bg-teal-600 hover:bg-teal-700"
            >
              <a href="/admin/classes">
                Gérer les classes
                <ChevronRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Sélectionnez une classe
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Choisissez la classe correspondant à la feuille d'appel reçue
              par l'administration.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((schoolClass) => (
              <Card
                key={schoolClass.id}
                className="group border-none shadow-sm ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:ring-teal-300 hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <School className="h-5 w-5" />
                    </div>

                    <Badge
                      variant="outline"
                      className="border-slate-200 text-slate-500"
                    >
                      {schoolClass.level ?? "Classe"}
                    </Badge>
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-slate-900">
                    {schoolClass.name}
                  </h3>

                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <Users className="h-4 w-4 text-slate-400" />
                    {schoolClass.studentCount} élève
                    {schoolClass.studentCount > 1 ? "s" : ""}
                  </div>

                  <Button
                    onClick={() => void selectClass(schoolClass.id)}
                    className="mt-5 w-full bg-teal-600 hover:bg-teal-700"
                  >
                    Ouvrir la classe
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 p-4 md:p-6">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 text-white md:px-6">
              <div>
                <h2 className="text-lg font-bold">Scanner la feuille d'appel</h2>
                <p className="mt-1 text-xs text-white/60">
                  {selectedClass?.name} · {attendanceDate}
                </p>
              </div>

              <Button
                variant="ghost"
                onClick={closeScanner}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                Fermer
              </Button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-3 md:p-6">
              {capturedImage ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                  <div className="relative max-h-[calc(100vh-230px)] max-w-full overflow-hidden rounded-xl bg-white shadow-2xl">
                    <img
                      src={capturedImage}
                      alt="Aperçu de la feuille d'appel"
                      className="max-h-[calc(100vh-230px)] max-w-full object-contain"
                    />
                  </div>

                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={retakeImage}
                      className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      Reprendre
                    </Button>
                    <Button
                      onClick={() => void useCapturedImage()}
                      disabled={importingImage}
                      className="bg-teal-600 hover:bg-teal-700"
                    >
                      {importingImage ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Reconnaissance en cours...
                        </>
                      ) : (
                        "Reconnaître cette feuille"
                      )}
                    </Button>
                  </div>
                </div>
              ) : cameraError ? (
                <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white">
                  <ScanLine className="mx-auto mb-4 h-10 w-10 text-teal-400" />
                  <h3 className="font-bold">Caméra indisponible</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {cameraError}
                  </p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 bg-teal-600 hover:bg-teal-700"
                  >
                    Importer une photo
                  </Button>
                </div>
              ) : (
                <div className="relative flex h-full w-full max-w-4xl items-center justify-center overflow-hidden rounded-xl bg-slate-900">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-contain"
                  />

                  <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-white/70 md:inset-10">
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/45 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-sm">
                      Cadrez toute la feuille dans la zone
                    </div>
                  </div>

                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm font-medium text-white">
                      Activation de la caméra...
                    </div>
                  )}
                </div>
              )}
            </div>

            {!capturedImage && !cameraError && (
              <div className="flex flex-col items-center gap-3 border-t border-white/10 bg-slate-950 px-4 py-4 text-center text-white md:px-6">
                <p className="text-xs text-white/60">
                  Tenez le téléphone au-dessus de la feuille et assurez-vous que les quatre coins sont visibles.
                </p>

                <Button
                  onClick={captureImage}
                  disabled={!cameraReady}
                  className="h-12 rounded-full bg-white px-7 text-slate-900 hover:bg-slate-100"
                >
                  <span className="mr-2 h-3 w-3 rounded-full bg-red-500" />
                  Capturer la feuille
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
