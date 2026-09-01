"use client";

import type { Chain } from "@swapkit/helpers";
import type { Keystore } from "@swapkit/wallet-keystore";
import { CheckIcon, CopyIcon, DownloadIcon, ShieldAlertIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import { useSwapKit } from "../../swapkit-context";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export interface WalletKeystoreCreateDialogProps {
  selectedChains?: Chain[];
}

export function WalletKeystoreCreateDialog({ selectedChains }: WalletKeystoreCreateDialogProps) {
  const modal = useModal();
  const { connectKeystore } = useSwapKit();
  const checkboxId = useId();
  const passwordInputId = useId();
  const confirmPasswordInputId = useId();

  const [currentStep, setCurrentStep] = useState(1);
  const [phrase, setPhrase] = useState("");
  const [savedPhrase, setSavedPhrase] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [keystore, setKeystore] = useState<Keystore | null>(null);
  const [copied, setCopied] = useState(false);
  const phraseRef = useRef<string>("");

  // Generate phrase on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { generatePhrase } = await import("@swapkit/wallet-keystore");
      const generated = generatePhrase(12);
      if (!cancelled) {
        phraseRef.current = generated;
        setPhrase(generated);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear sensitive refs and state on unmount
  useEffect(() => {
    return () => {
      phraseRef.current = "";
      setPhrase("");
      setPassword("");
      setConfirmPassword("");
      setKeystore(null);
    };
  }, []);

  const phraseWords = phrase ? phrase.split(" ") : [];

  const handleCopyPhrase = useCallback(async () => {
    if (!phrase) return;
    await navigator.clipboard.writeText(phrase);
    setCopied(true);
    toast.success("Recovery phrase copied to clipboard", { description: "Auto-clears in 60s. Store it securely." });
    setTimeout(() => setCopied(false), 2000);
    // Auto-clear clipboard after 60s, but only if it still contains our phrase
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === phrase) await navigator.clipboard.writeText("");
      } catch {
        // Clipboard read may be blocked; fall back to unconditional clear
        try {
          await navigator.clipboard.writeText("");
        } catch {
          // User denied clipboard access — nothing we can do
        }
      }
    }, 60_000);
  }, [phrase]);

  const handleConnect = useCallback(async () => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordError("");

    try {
      setIsConnecting(true);
      setCurrentStep(3);

      const { encryptToKeyStore, KEYSTORE_SUPPORTED_CHAINS } = await import("@swapkit/wallet-keystore");

      const encrypted = await encryptToKeyStore(phraseRef.current, password);
      setKeystore(encrypted);

      const chainsToConnect =
        selectedChains && selectedChains.length > 0
          ? KEYSTORE_SUPPORTED_CHAINS.filter((c) => selectedChains.includes(c))
          : KEYSTORE_SUPPORTED_CHAINS;

      const finalChains = chainsToConnect.length > 0 ? chainsToConnect : KEYSTORE_SUPPORTED_CHAINS;

      await connectKeystore(
        { chains: finalChains, file: new File([JSON.stringify(encrypted)], "keystore.json"), keystore: encrypted },
        password,
      );

      // Clear sensitive data after successful connection
      setPassword("");
      setConfirmPassword("");
      setPhrase("");
      phraseRef.current = "";
      setCurrentStep(4);
    } catch {
      setPasswordError("Something went wrong while creating the wallet.");
      setCurrentStep(2);
      // Clear sensitive data even on failure — user may abandon the dialog
      setPassword("");
      setConfirmPassword("");
      setPhrase("");
      phraseRef.current = "";
    } finally {
      setIsConnecting(false);
    }
  }, [password, confirmPassword, selectedChains, connectKeystore]);

  const handleDownloadKeystore = useCallback(() => {
    if (!keystore) return;
    const blob = new Blob([JSON.stringify(keystore, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keystore.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [keystore]);

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new wallet</DialogTitle>
        </DialogHeader>

        <Tabs value={currentStep.toString()}>
          <TabsList className="sk-ui-w-full sk-ui-gap-2 sk-ui-h-auto sk-ui-p-0">
            <TabsTrigger className={cn(currentStep > 1 && "!sk-ui-bg-accent")} value="1" variant="stepper" />
            <TabsTrigger className={cn(currentStep > 2 && "!sk-ui-bg-accent")} value="2" variant="stepper" />
            <TabsTrigger className={cn(currentStep > 3 && "!sk-ui-bg-accent")} value="3" variant="stepper" />
            <TabsTrigger className={cn(currentStep >= 4 && "!sk-ui-bg-accent")} value="4" variant="stepper" />
          </TabsList>

          {/* Step 1: Generate & Display Phrase */}
          <TabsContent value="1">
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
              <div className="sk-ui-rounded-md sk-ui-border sk-ui-border-yellow-500/20 sk-ui-bg-yellow-500/10 sk-ui-p-3">
                <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
                  <ShieldAlertIcon className="sk-ui-mt-0.5 sk-ui-h-4 sk-ui-w-4 sk-ui-shrink-0 sk-ui-text-yellow-400" />
                  <div>
                    <p className="sk-ui-font-medium sk-ui-text-sm sk-ui-text-yellow-300">
                      Write down your recovery phrase
                    </p>
                    <p className="sk-ui-mt-1 sk-ui-text-xs sk-ui-text-yellow-300/70">
                      This is the only way to recover your wallet. Store it securely and never share it with anyone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sk-ui-grid sk-ui-grid-cols-3 sk-ui-gap-2">
                {phraseWords.map((word, index) => {
                  const key = `word-${index}-${word}`;
                  return (
                    <div
                      className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-md sk-ui-border sk-ui-border-white/10 sk-ui-bg-secondary sk-ui-px-3 sk-ui-py-2"
                      key={key}>
                      <span className="sk-ui-text-xs sk-ui-text-muted-foreground sk-ui-w-4">{index + 1}.</span>
                      <span className="sk-ui-text-sm sk-ui-font-medium">{word}</span>
                    </div>
                  );
                })}
              </div>

              <Button className="sk-ui-w-full" onClick={handleCopyPhrase} type="button" variant="ghost">
                {copied ? <CheckIcon className="sk-ui-h-4 sk-ui-w-4" /> : <CopyIcon className="sk-ui-h-4 sk-ui-w-4" />}
                {copied ? "Copied!" : "Copy to clipboard"}
              </Button>

              <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
                <Checkbox
                  checked={savedPhrase}
                  id={checkboxId}
                  onCheckedChange={(checked) => setSavedPhrase(checked === true)}
                />
                <label className="sk-ui-cursor-pointer sk-ui-text-sm sk-ui-text-foreground" htmlFor={checkboxId}>
                  I have saved my recovery phrase
                </label>
              </div>
            </div>

            <DialogFooter className="sk-ui-mt-4">
              <Button onClick={() => modal.resolve({ confirmed: false })} type="button">
                Cancel
              </Button>

              <Button disabled={!savedPhrase} onClick={() => setCurrentStep(2)} type="button" variant="primary">
                Continue
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Step 2: Set Password */}
          <TabsContent value="2">
            <div className="sk-ui-mt-4 sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
              <span className="sk-ui-text-sm sk-ui-text-white sk-ui-text-opacity-65">
                Create a password to encrypt your wallet keystore file
              </span>

              <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1.5">
                <label className="sk-ui-text-sm sk-ui-font-medium" htmlFor={passwordInputId}>
                  Password
                </label>
                <Input
                  autoFocus
                  id={passwordInputId}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Enter password (min. 8 characters)..."
                  type="password"
                  value={password}
                />
              </div>

              <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1.5">
                <label className="sk-ui-text-sm sk-ui-font-medium" htmlFor={confirmPasswordInputId}>
                  Confirm Password
                </label>
                <Input
                  id={confirmPasswordInputId}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Confirm your password..."
                  type="password"
                  value={confirmPassword}
                />
              </div>

              {passwordError && <p className="sk-ui-text-sm sk-ui-text-red-400">{passwordError}</p>}
            </div>

            <DialogFooter className="sk-ui-mt-4">
              <Button onClick={() => setCurrentStep(1)} type="button">
                Go Back
              </Button>

              <Button
                disabled={!password || !confirmPassword || isConnecting}
                isLoading={isConnecting}
                onClick={handleConnect}
                type="button"
                variant="primary">
                Create Wallet
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Step 3: Connecting */}
          <TabsContent value="3">
            <div className="sk-ui-mt-4 sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
              <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-3 sk-ui-py-4">
                <div className="sk-ui-h-8 sk-ui-w-8 sk-ui-animate-spin sk-ui-rounded-full sk-ui-border-2 sk-ui-border-accent sk-ui-border-t-transparent" />
                <p className="sk-ui-text-sm sk-ui-text-muted-foreground">Creating and connecting your wallet...</p>
              </div>
            </div>
          </TabsContent>

          {/* Step 4: Success */}
          <TabsContent value="4">
            <div className="sk-ui-mt-4 sk-ui-flex sk-ui-flex-col sk-ui-gap-4 sk-ui-text-center">
              <div className="sk-ui-rounded-md sk-ui-border sk-ui-border-green-500/20 sk-ui-bg-green-500/10 sk-ui-p-4">
                <CheckIcon className="sk-ui-mx-auto sk-ui-mb-2 sk-ui-h-8 sk-ui-w-8 sk-ui-text-green-500" />
                <h3 className="sk-ui-mb-1 sk-ui-font-medium sk-ui-text-green-300">Wallet Created Successfully!</h3>
                <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
                  Your new keystore wallet is connected and ready to use. Download your keystore file to access your
                  wallet in the future.
                </p>
              </div>

              {keystore && (
                <Button className="sk-ui-w-full" onClick={handleDownloadKeystore} type="button" variant="primary">
                  <DownloadIcon className="sk-ui-h-4 sk-ui-w-4" />
                  Download Keystore
                </Button>
              )}
            </div>

            <DialogFooter className="sk-ui-mt-4">
              <Button onClick={() => modal.resolve({ confirmed: true, data: undefined })} variant="primary">
                Done
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
