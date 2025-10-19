import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles } from "lucide-react";

const PRESET_INTERESTS = ["Sports", "Meditation", "Yoga", "Arts", "Music"];
const PRESET_VIBES = ["Epic", "Peaceful", "Exciting", "Unique", "Recurring"];
const EMAIL_FREQUENCIES = [
  { value: "daily", label: "Every Day" },
  { value: "every_other_day", label: "Every Other Day" },
  { value: "weekly", label: "Weekly" },
];

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState("");
  const [emailFrequency, setEmailFrequency] = useState("weekly");

  useEffect(() => {
    loadUserPreferences();
  }, []);

  const loadUserPreferences = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", user.id)
        .single();
      if (profile) setCity(profile.city);

      // Load interests
      const { data: interests } = await supabase
        .from("user_interests")
        .select("interest")
        .eq("user_id", user.id);
      if (interests) {
        setSelectedInterests(interests.map((i) => i.interest));
      }

      // Load vibes
      const { data: vibes } = await supabase
        .from("user_vibes")
        .select("vibe")
        .eq("user_id", user.id);
      if (vibes) {
        setSelectedVibes(vibes.map((v) => v.vibe));
      }

      // Load email preferences
      const { data: emailPref } = await supabase
        .from("email_preferences")
        .select("frequency")
        .eq("user_id", user.id)
        .single();
      if (emailPref) setEmailFrequency(emailPref.frequency);
    } catch (error) {
      console.error("Error loading preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const addCustomInterest = () => {
    if (customInterest.trim() && !selectedInterests.includes(customInterest.trim())) {
      setSelectedInterests([...selectedInterests, customInterest.trim()]);
      setCustomInterest("");
    }
  };

  const toggleVibe = (vibe: string) => {
    setSelectedVibes((prev) =>
      prev.includes(vibe) ? prev.filter((v) => v !== vibe) : [...prev, vibe]
    );
  };

  const addCustomVibe = () => {
    if (customVibe.trim() && !selectedVibes.includes(customVibe.trim())) {
      setSelectedVibes([...selectedVibes, customVibe.trim()]);
      setCustomVibe("");
    }
  };

  const handleSave = async () => {
    if (selectedInterests.length === 0 || selectedVibes.length === 0) {
      toast({
        variant: "destructive",
        title: "Select at least one interest and vibe",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      // Update profile
      await supabase.from("profiles").update({ city }).eq("id", user.id);

      // Delete and re-add interests
      await supabase.from("user_interests").delete().eq("user_id", user.id);
      const interestPromises = selectedInterests.map((interest) =>
        supabase.from("user_interests").insert({
          user_id: user.id,
          interest,
          is_custom: !PRESET_INTERESTS.includes(interest),
        })
      );
      await Promise.all(interestPromises);

      // Delete and re-add vibes
      await supabase.from("user_vibes").delete().eq("user_id", user.id);
      const vibePromises = selectedVibes.map((vibe) =>
        supabase.from("user_vibes").insert({
          user_id: user.id,
          vibe,
          is_custom: !PRESET_VIBES.includes(vibe),
        })
      );
      await Promise.all(vibePromises);

      // Update email preferences
      await supabase
        .from("email_preferences")
        .update({ frequency: emailFrequency })
        .eq("user_id", user.id);

      toast({
        title: "Settings saved!",
        description: "Your preferences have been updated.",
      });
      navigate("/discover");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-subtle">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center gap-4 px-4 py-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/discover")}
              className="hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Settings
              </span>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl">
            <div className="space-y-8 rounded-2xl bg-card p-8 shadow-card">
              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="e.g., San Francisco"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-12"
                />
              </div>

              {/* Interests */}
              <div className="space-y-4">
                <Label>Interests</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_INTERESTS.map((interest) => (
                    <Badge
                      key={interest}
                      variant={selectedInterests.includes(interest) ? "default" : "outline"}
                      className="cursor-pointer px-4 py-2 text-sm transition-all hover:scale-105"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add custom interest"
                    value={customInterest}
                    onChange={(e) => setCustomInterest(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCustomInterest())}
                  />
                  <Button type="button" onClick={addCustomInterest} variant="outline">
                    Add
                  </Button>
                </div>
                {selectedInterests.filter((i) => !PRESET_INTERESTS.includes(i)).map((interest) => (
                  <Badge
                    key={interest}
                    variant="default"
                    className="mr-2 cursor-pointer"
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest} ✕
                  </Badge>
                ))}
              </div>

              {/* Vibes */}
              <div className="space-y-4">
                <Label>Vibes</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_VIBES.map((vibe) => (
                    <Badge
                      key={vibe}
                      variant={selectedVibes.includes(vibe) ? "default" : "outline"}
                      className="cursor-pointer px-4 py-2 text-sm transition-all hover:scale-105"
                      onClick={() => toggleVibe(vibe)}
                    >
                      {vibe}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add custom vibe"
                    value={customVibe}
                    onChange={(e) => setCustomVibe(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCustomVibe())}
                  />
                  <Button type="button" onClick={addCustomVibe} variant="outline">
                    Add
                  </Button>
                </div>
                {selectedVibes.filter((v) => !PRESET_VIBES.includes(v)).map((vibe) => (
                  <Badge
                    key={vibe}
                    variant="default"
                    className="mr-2 cursor-pointer"
                    onClick={() => toggleVibe(vibe)}
                  >
                    {vibe} ✕
                  </Badge>
                ))}
              </div>

              {/* Email Frequency */}
              <div className="space-y-4">
                <Label>Email Frequency</Label>
                <div className="flex flex-wrap gap-2">
                  {EMAIL_FREQUENCIES.map((freq) => (
                    <Badge
                      key={freq.value}
                      variant={emailFrequency === freq.value ? "default" : "outline"}
                      className="cursor-pointer px-4 py-2 text-sm transition-all hover:scale-105"
                      onClick={() => setEmailFrequency(freq.value)}
                    >
                      {freq.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={loading}
                className="h-12 w-full bg-gradient-primary text-primary-foreground shadow-glow transition-all hover:scale-[1.02]"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
