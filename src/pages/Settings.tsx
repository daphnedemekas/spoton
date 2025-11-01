import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Plus, Upload } from "lucide-react";
import { INTEREST_CATEGORIES, VIBE_CATEGORIES, getAllInterests, getAllVibes } from "@/lib/categories";
import { cn } from "@/lib/utils";
import logoIcon from "@/assets/logo-icon.png";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderSelectableButton = (
    value: string,
    selected: boolean,
    onToggle: (value: string) => void,
    color: "primary" | "secondary" = "primary"
  ) => {
    const selectedClasses = color === "secondary"
      ? "bg-secondary text-secondary-foreground border-secondary"
      : "bg-primary text-primary-foreground border-primary";
    const ringClasses = color === "secondary" ? "focus-visible:ring-secondary" : "focus-visible:ring-primary";

    return (
      <button
        type="button"
        onClick={() => onToggle(value)}
        className={cn(
          "rounded-full border px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2",
          ringClasses,
          selected ? selectedClasses : "bg-background text-foreground hover:bg-muted"
        )}
        aria-pressed={selected}
      >
        {value}
      </button>
    );
  };

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
        .select("city, profile_picture_url")
        .eq("id", user.id)
        .single();
      if (profile) {
        setCity(profile.city);
        setProfilePictureUrl(profile.profile_picture_url);
      }

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

  const allPresetInterests = getAllInterests();
  const allPresetVibes = getAllVibes();

  const handleUploadProfilePicture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please upload an image file",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "File size must be less than 5MB",
      });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete old profile picture if exists
      if (profilePictureUrl) {
        const oldPath = profilePictureUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('profile-pictures').remove([`${user.id}/${oldPath}`]);
        }
      }

      // Upload new picture
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfilePictureUrl(publicUrl);
      toast({
        title: "Success",
        description: "Profile picture updated!",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setUploading(false);
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
          is_custom: !allPresetInterests.includes(interest),
        })
      );
      await Promise.all(interestPromises);

      // Delete and re-add vibes
      await supabase.from("user_vibes").delete().eq("user_id", user.id);
      const vibePromises = selectedVibes.map((vibe) =>
        supabase.from("user_vibes").insert({
          user_id: user.id,
          vibe,
          is_custom: !allPresetVibes.includes(vibe),
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
      <main id="main-content" className="min-h-screen bg-gradient-subtle" aria-label="Settings">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center gap-4 px-4 py-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/discover")}
              className="hover:bg-secondary"
              aria-label="Back to discover"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-glow">
                <img src={logoIcon} alt="SpotOn" className="h-8 w-8" />
              </div>
              <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Settings
              </span>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-4xl">
            <div className="space-y-8 rounded-2xl bg-card p-8 shadow-card">
              {/* Profile Picture */}
              <div className="space-y-4">
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profilePictureUrl || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {city[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadProfilePicture}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading..." : "Upload Photo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Max 5MB. JPG, PNG, or WEBP
                    </p>
                  </div>
                </div>
              </div>

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
              <fieldset className="space-y-4" aria-describedby="settings-interests-help">
                <legend className="flex items-center justify-between text-base font-semibold">
                  Interests ({selectedInterests.length} selected)
                </legend>
                <p id="settings-interests-help" className="text-sm text-muted-foreground">
                  Update the interests that shape your recommendations. Press Enter or Space to toggle an option.
                </p>
                
                <Accordion type="multiple" className="w-full">
                  {INTEREST_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    return (
                      <AccordionItem key={category.name} value={category.name}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                            <span className="font-semibold">{category.name}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex flex-wrap gap-2 pt-2">
                            {category.items.map((interest) => (
                              <div key={interest}>
                                {renderSelectableButton(
                                  interest,
                                  selectedInterests.includes(interest),
                                  toggleInterest
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>

                <div className="flex gap-2" role="group" aria-label="Add custom interest">
                  <Input
                    placeholder="Add custom interest"
                    aria-label="Add custom interest"
                    value={customInterest}
                    onChange={(e) => setCustomInterest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomInterest();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={addCustomInterest}
                    variant="outline"
                    size="icon"
                    aria-label="Add custom interest"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {selectedInterests.filter((i) => !allPresetInterests.includes(i)).length > 0 && (
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Custom interests">
                    {selectedInterests.filter((i) => !allPresetInterests.includes(i)).map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        className="rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                        onClick={() => toggleInterest(interest)}
                        aria-pressed={true}
                        role="listitem"
                        aria-label={`Remove custom interest ${interest}`}
                      >
                        {interest} ✕
                      </button>
                    ))}
                  </div>
                )}
                <div role="status" aria-live="polite" className="sr-only">
                  {selectedInterests.length} interests selected.
                </div>
              </fieldset>

              {/* Vibes */}
              <fieldset className="space-y-4" aria-describedby="settings-vibes-help">
                <legend className="flex items-center justify-between text-base font-semibold">
                  Vibes ({selectedVibes.length} selected)
                </legend>
                <p id="settings-vibes-help" className="text-sm text-muted-foreground">
                  Choose the vibes that best describe your ideal events. Press Enter or Space to toggle an option.
                </p>
                
                <Accordion type="multiple" className="w-full">
                  {VIBE_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    return (
                      <AccordionItem key={category.name} value={category.name}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
                            <span className="font-semibold">{category.name}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex flex-wrap gap-2 pt-2">
                            {category.items.map((vibe) => (
                              <div key={vibe}>
                                {renderSelectableButton(
                                  vibe,
                                  selectedVibes.includes(vibe),
                                  toggleVibe,
                                  "secondary"
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>

                <div className="flex gap-2" role="group" aria-label="Add custom vibe">
                  <Input
                    placeholder="Add custom vibe"
                    aria-label="Add custom vibe"
                    value={customVibe}
                    onChange={(e) => setCustomVibe(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomVibe();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={addCustomVibe}
                    variant="outline"
                    size="icon"
                    aria-label="Add custom vibe"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {selectedVibes.filter((v) => !allPresetVibes.includes(v)).length > 0 && (
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Custom vibes">
                    {selectedVibes.filter((v) => !allPresetVibes.includes(v)).map((vibe) => (
                      <button
                        key={vibe}
                        type="button"
                        className="rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                        onClick={() => toggleVibe(vibe)}
                        aria-pressed={true}
                        role="listitem"
                        aria-label={`Remove custom vibe ${vibe}`}
                      >
                        {vibe} ✕
                      </button>
                    ))}
                  </div>
                )}
                <div role="status" aria-live="polite" className="sr-only">
                  {selectedVibes.length} vibes selected.
                </div>
              </fieldset>

              {/* Email Frequency */}
              <fieldset className="space-y-4">
                <legend className="text-base font-semibold">Email Frequency</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Email frequency">
                  {EMAIL_FREQUENCIES.map((freq) => {
                    const selected = emailFrequency === freq.value;
                    return (
                      <label
                        key={freq.value}
                        className={cn(
                          "cursor-pointer rounded-full border px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          selected ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground hover:bg-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name="settings-email-frequency"
                          value={freq.value}
                          checked={selected}
                          onChange={() => setEmailFrequency(freq.value)}
                          className="sr-only"
                        />
                        {freq.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Button
                onClick={handleSave}
                disabled={loading}
                className="h-12 w-full bg-gradient-primary text-primary-foreground shadow-glow transition-all hover:scale-[1.02]"
              aria-busy={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
