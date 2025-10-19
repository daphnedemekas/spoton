import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/AuthGuard";

const PRESET_INTERESTS = ["Sports", "Meditation", "Yoga", "Arts", "Music"];
const PRESET_VIBES = ["Epic", "Peaceful", "Exciting", "Unique", "Recurring"];
const EMAIL_FREQUENCIES = [
  { value: "daily", label: "Every Day" },
  { value: "every_other_day", label: "Every Other Day" },
  { value: "weekly", label: "Weekly" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [city, setCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState("");
  const [emailFrequency, setEmailFrequency] = useState("weekly");

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedInterests.length === 0) {
      toast({
        variant: "destructive",
        title: "Select at least one interest",
      });
      return;
    }

    if (selectedVibes.length === 0) {
      toast({
        variant: "destructive",
        title: "Select at least one vibe",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email!,
        city,
      });
      if (profileError) throw profileError;

      // Add interests
      const interestPromises = selectedInterests.map((interest) =>
        supabase.from("user_interests").insert({
          user_id: user.id,
          interest,
          is_custom: !PRESET_INTERESTS.includes(interest),
        })
      );
      await Promise.all(interestPromises);

      // Add vibes
      const vibePromises = selectedVibes.map((vibe) =>
        supabase.from("user_vibes").insert({
          user_id: user.id,
          vibe,
          is_custom: !PRESET_VIBES.includes(vibe),
        })
      );
      await Promise.all(vibePromises);

      // Add email preferences
      const { error: emailError } = await supabase
        .from("email_preferences")
        .insert({
          user_id: user.id,
          frequency: emailFrequency,
        });
      if (emailError) throw emailError;

      toast({
        title: "Profile created!",
        description: "Let's find some amazing events for you.",
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
      <div className="min-h-screen bg-gradient-subtle px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Tell us about yourself
            </h1>
            <p className="text-muted-foreground">
              We'll personalize events just for you
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 rounded-2xl bg-card p-8 shadow-card">
            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">What city do you live in?</Label>
              <Input
                id="city"
                placeholder="e.g., San Francisco"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="h-12"
              />
            </div>

            {/* Interests */}
            <div className="space-y-4">
              <Label>What are your interests?</Label>
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
              {selectedInterests.filter(i => !PRESET_INTERESTS.includes(i)).map((interest) => (
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
              <Label>What's your vibe?</Label>
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
              {selectedVibes.filter(v => !PRESET_VIBES.includes(v)).map((vibe) => (
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
              <Label>How often would you like email updates?</Label>
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
              type="submit"
              disabled={loading}
              className="h-12 w-full bg-gradient-primary text-primary-foreground shadow-glow transition-all hover:scale-[1.02]"
            >
              {loading ? "Creating profile..." : "Continue"}
            </Button>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
