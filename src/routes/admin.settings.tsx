import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Settings,
  School,
  MessageSquare,
  Bell,
  Save,
  MapPin,
  Calendar,
  Smartphone,
  Info,
} from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { requireRole } from "@/lib/auth-route";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: ({ context }) => requireRole(context, "admin"),
  head: () => ({
    meta: [
      { title: "Paramètres de l'établissement — EDUSA" },
      {
        name: "description",
        content:
          "Configurez les informations de l'école et personnalisez le message WhatsApp envoyé aux parents.",
      },
    ],
  }),
  component: SettingsPage,
});

const DEFAULT_MESSAGE_TEMPLATE =
  "Bonjour {parent}, votre enfant {élève} a été noté absent en {classe} le {date}. Merci de contacter l'établissement.";

function SettingsPage() {
  const supabaseClient = supabase as any;

  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const [msgTemplate, setMsgTemplate] = useState(
    DEFAULT_MESSAGE_TEMPLATE,
  );

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        setLoading(true);

        const {
          data: { user },
          error: userError,
        } = await supabaseClient.auth.getUser();

        if (userError || !user) {
          toast.error("Impossible d'identifier l'administrateur.");
          return;
        }

        const { data: profile, error: profileError } =
          await supabaseClient
            .from("profiles")
            .select("school_id")
            .eq("id", user.id)
            .single();

        if (profileError || !profile?.school_id) {
          toast.error("Établissement introuvable.");
          return;
        }

        if (cancelled) return;

        setSchoolId(profile.school_id);

        /*
         * Load school information.
         */
        const { data: schoolData, error: schoolError } =
          await supabaseClient
            .from("schools")
            .select("name, city, academic_year")
            .eq("id", profile.school_id)
            .single();

        if (schoolError) {
          throw schoolError;
        }

        if (cancelled) return;

        setSchoolName(schoolData?.name ?? "");
        setCity(schoolData?.city ?? "");
        setAcademicYear(schoolData?.academic_year ?? "");

        /*
         * Load the active French notification template.
         */
        const { data: templateData, error: templateError } =
          await supabaseClient
            .from("notification_templates")
            .select("id, content, active, language")
            .eq("school_id", profile.school_id)
            .eq("language", "fr")
            .order("created_at", {
              ascending: false,
            })
            .limit(1);

        if (!templateError && templateData?.length) {
          const template = templateData[0];

          if (template.content) {
            setMsgTemplate(template.content);
          }

          setNotificationsEnabled(template.active ?? true);
        }
      } catch (error) {
        console.error(
          "[EDUSA Settings] Impossible de charger les paramètres.",
          error,
        );

        if (!cancelled) {
          toast.error(
            "Impossible de charger les paramètres de l'établissement.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSchoolInfo() {
    if (!schoolId) {
      toast.error("Établissement introuvable.");
      return;
    }

    const name = schoolName.trim();
    const normalizedCity = city.trim();
    const normalizedAcademicYear = academicYear.trim();

    if (!name) {
      toast.error("Le nom de l'école est obligatoire.");
      return;
    }

    if (!normalizedAcademicYear) {
      toast.error("L'année scolaire est obligatoire.");
      return;
    }

    try {
      setSavingSchool(true);

      const { error } = await supabaseClient
        .from("schools")
        .update({
          name,
          city: normalizedCity || null,
          academic_year: normalizedAcademicYear,
        })
        .eq("id", schoolId);

      if (error) {
        throw error;
      }

      setSchoolName(name);
      setCity(normalizedCity);
      setAcademicYear(normalizedAcademicYear);

      /*
       * Notify AdminShell immediately so the sidebar
       * updates without a page refresh.
       */
      window.dispatchEvent(
        new CustomEvent("edusa:school-updated", {
          detail: {
            name,
          },
        }),
      );

      toast.success(
        "Informations de l'établissement mises à jour.",
      );
    } catch (error) {
      console.error(
        "[EDUSA Settings] Save school information",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour l'établissement.",
      );
    } finally {
      setSavingSchool(false);
    }
  }

  async function saveNotificationTemplate() {
    if (!schoolId) {
      toast.error("Établissement introuvable.");
      return;
    }

    const content = msgTemplate.trim();

    if (!content) {
      toast.error("Le modèle de message ne peut pas être vide.");
      return;
    }

    try {
      setSavingTemplate(true);

      const { data: existingTemplate, error: existingError } =
        await supabaseClient
          .from("notification_templates")
          .select("id")
          .eq("school_id", schoolId)
          .eq("language", "fr")
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingTemplate?.id) {
        const { error } = await supabaseClient
          .from("notification_templates")
          .update({
            content,
            active: notificationsEnabled,
          })
          .eq("id", existingTemplate.id)
          .eq("school_id", schoolId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabaseClient
          .from("notification_templates")
          .insert({
            school_id: schoolId,
            name: "Message d'absence WhatsApp",
            language: "fr",
            content,
            active: notificationsEnabled,
          });

        if (error) {
          throw error;
        }
      }

      toast.success("Modèle de notification mis à jour.");
    } catch (error) {
      console.error(
        "[EDUSA Settings] Save notification template",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour le modèle de notification.",
      );
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleNotificationToggle(
    enabled: boolean,
  ) {
    setNotificationsEnabled(enabled);

    if (!schoolId) {
      return;
    }

    try {
      const { data: existingTemplate, error: existingError } =
        await supabaseClient
          .from("notification_templates")
          .select("id")
          .eq("school_id", schoolId)
          .eq("language", "fr")
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingTemplate?.id) {
        const { error } = await supabaseClient
          .from("notification_templates")
          .update({
            active: enabled,
          })
          .eq("id", existingTemplate.id)
          .eq("school_id", schoolId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabaseClient
          .from("notification_templates")
          .insert({
            school_id: schoolId,
            name: "Message d'absence WhatsApp",
            language: "fr",
            content:
              msgTemplate.trim() || DEFAULT_MESSAGE_TEMPLATE,
            active: enabled,
          });

        if (error) {
          throw error;
        }
      }

      toast.success(
        enabled
          ? "Notifications WhatsApp activées."
          : "Notifications WhatsApp désactivées.",
      );
    } catch (error) {
      console.error(
        "[EDUSA Settings] Toggle WhatsApp notifications",
        error,
      );

      setNotificationsEnabled(!enabled);

      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de modifier le statut des notifications.",
      );
    }
  }

  return (
    <AdminShell
      title="Paramètres"
      subtitle="Configuration de l'établissement et des services de notification"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section 1 : Informations de l'école */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <School className="h-5 w-5" />
              </div>

              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Établissement
                </CardTitle>

                <CardDescription className="text-xs">
                  Identité officielle de votre école
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2">
              <Label
                htmlFor="school"
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Nom de l'école
              </Label>

              <div className="relative">
                <School className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />

                <Input
                  id="school"
                  value={schoolName}
                  onChange={(e) =>
                    setSchoolName(e.target.value)
                  }
                  disabled={loading || savingSchool}
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="city"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Ville
                </Label>

                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />

                  <Input
                    id="city"
                    value={city}
                    onChange={(e) =>
                      setCity(e.target.value)
                    }
                    disabled={loading || savingSchool}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="year"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Année scolaire
                </Label>

                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />

                  <Input
                    id="year"
                    value={academicYear}
                    onChange={(e) =>
                      setAcademicYear(e.target.value)
                    }
                    placeholder="2026-2027"
                    disabled={loading || savingSchool}
                    className="h-11 pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="w-full bg-teal-600 px-8 font-bold shadow-lg shadow-teal-600/10 hover:bg-teal-700 sm:w-auto"
                onClick={() => void saveSchoolInfo()}
                disabled={
                  loading ||
                  savingSchool ||
                  !schoolId
                }
              >
                <Save className="mr-2 h-4 w-4" />

                {savingSchool
                  ? "Enregistrement..."
                  : "Enregistrer les infos"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 : Notifications WhatsApp */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <MessageSquare className="h-5 w-5" />
              </div>

              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Notifications WhatsApp
                </CardTitle>

                <CardDescription className="text-xs">
                  Communication automatique avec les parents
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white">
                  <Smartphone className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-sm font-bold text-teal-900">
                    Activer les SMS/WhatsApp
                  </p>

                  <p className="text-[10px] font-medium uppercase tracking-tighter text-teal-600">
                    Envoi automatique après validation de l'appel
                  </p>
                </div>
              </div>

              <Switch
                checked={notificationsEnabled}
                onCheckedChange={(checked) =>
                  void handleNotificationToggle(checked)
                }
                disabled={loading || !schoolId}
                className="data-[state=checked]:bg-teal-600"
              />
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="msg"
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Modèle de message d'absence
              </Label>

              <Textarea
                id="msg"
                value={msgTemplate}
                onChange={(e) =>
                  setMsgTemplate(e.target.value)
                }
                disabled={loading || savingTemplate}
                className="min-h-[100px] resize-none text-sm leading-relaxed"
              />

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  "{parent}",
                  "{élève}",
                  "{classe}",
                  "{date}",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="pt-2">
                <Button
                  onClick={() =>
                    void saveNotificationTemplate()
                  }
                  disabled={
                    loading ||
                    savingTemplate ||
                    !schoolId
                  }
                  className="bg-teal-600 font-bold hover:bg-teal-700"
                >
                  <Save className="mr-2 h-4 w-4" />

                  {savingTemplate
                    ? "Enregistrement..."
                    : "Enregistrer le modèle"}
                </Button>
              </div>
            </div>

            <div className="relative space-y-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="absolute right-0 top-0 p-2 opacity-10">
                <Bell className="h-12 w-12 text-slate-900" />
              </div>

              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Info className="h-3 w-3" />
                Aperçu du message
              </p>

              <p className="text-sm leading-relaxed text-slate-600 italic">
                "
                {msgTemplate
                  .replace("{parent}", "M. Hassan")
                  .replace("{élève}", "Ibrahim")
                  .replace("{classe}", "5ème A")
                  .replace("{date}", "14/08")}
                "
              </p>
            </div>

            <p className="rounded-lg bg-teal-50/30 py-2 text-center text-[10px] font-bold uppercase text-teal-600/60">
              L'intégration API WhatsApp Business est configurée avec Twilio.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}