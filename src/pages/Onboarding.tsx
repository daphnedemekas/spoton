import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthGuard } from "@/components/AuthGuard";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { INTEREST_CATEGORIES, VIBE_CATEGORIES, getAllInterests, getAllVibes } from "@/lib/categories";
import { cn } from "@/lib/utils";
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

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState("");
  const [emailFrequency, setEmailFrequency] = useState("weekly");

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

  const allPresetInterests = getAllInterests();
  const allPresetVibes = getAllVibes();

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
        first_name: firstName,
        last_name: lastName,
        city,
      });
      if (profileError) throw profileError;

      // Add interests
      const interestPromises = selectedInterests.map((interest) =>
        supabase.from("user_interests").insert({
          user_id: user.id,
          interest,
          is_custom: !allPresetInterests.includes(interest),
        })
      );
      await Promise.all(interestPromises);

      // Add vibes
      const vibePromises = selectedVibes.map((vibe) =>
        supabase.from("user_vibes").insert({
          user_id: user.id,
          vibe,
          is_custom: !allPresetVibes.includes(vibe),
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
      <main id="main-content" className="min-h-screen bg-gradient-subtle px-4 py-12" aria-label="Onboarding">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Tell us about yourself
            </h1>
            <p className="text-muted-foreground">
              We'll personalize events just for you
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 rounded-2xl bg-card p-8 shadow-card">
            {/* Name */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="e.g., John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="e.g., Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
            </div>

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
            <fieldset className="space-y-4" aria-describedby="onboarding-interests-help">
              <legend className="flex items-center justify-between text-base font-semibold">
                What are your interests? ({selectedInterests.length} selected)
              </legend>
              <p id="onboarding-interests-help" className="text-sm text-muted-foreground">
                Select all interests that apply. Press Enter or Space to toggle an option.
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
              {selectedInterests.filter(i => !allPresetInterests.includes(i)).length > 0 && (
                <div className="flex flex-wrap gap-2" role="list" aria-label="Custom interests">
                  {selectedInterests.filter(i => !allPresetInterests.includes(i)).map((interest) => (
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
            <fieldset className="space-y-4" aria-describedby="onboarding-vibes-help">
              <legend className="flex items-center justify-between text-base font-semibold">
                What's your vibe? ({selectedVibes.length} selected)
              </legend>
              <p id="onboarding-vibes-help" className="text-sm text-muted-foreground">
                Select all vibes that describe you. Press Enter or Space to toggle an option.
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
              {selectedVibes.filter(v => !allPresetVibes.includes(v)).length > 0 && (
                <div className="flex flex-wrap gap-2" role="list" aria-label="Custom vibes">
                  {selectedVibes.filter(v => !allPresetVibes.includes(v)).map((vibe) => (
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
              <legend className="text-base font-semibold">How often would you like email updates?</legend>
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
                        name="email-frequency"
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
              type="submit"
              disabled={loading}
              className="h-12 w-full bg-gradient-primary text-primary-foreground shadow-glow transition-all hover:scale-[1.02]"
              aria-busy={loading}
            >
              {loading ? "Creating profile..." : "Continue"}
            </Button>
          </form>
        </div>
      </main>
    </AuthGuard>
  );
}
