"use client";

import type { Chain } from "@swapkit/helpers";
import type { Keystore } from "@swapkit/wallet-keystore";
import { CheckCircleIcon, CheckIcon, DownloadIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import { useSwapKit } from "../../swapkit-context";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

export interface WalletKeystorePhraseDialogProps {
  selectedChains?: Chain[];
}

export function WalletKeystorePhraseDialog({ selectedChains }: WalletKeystorePhraseDialogProps) {
  const modal = useModal();
  const { connectKeystore } = useSwapKit();
  const passwordInputId = useId();
  const confirmPasswordInputId = useId();

  const [currentStep, setCurrentStep] = useState(1);
  const [phrase, setPhrase] = useState("");
  const [phraseValid, setPhraseValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [keystore, setKeystore] = useState<Keystore | null>(null);
  const phraseRef = useRef<string>("");
  // Cache the dynamically-imported keystore module so we don't re-fetch it on every keystroke
  const keystoreModuleRef = useRef<typeof import("@swapkit/wallet-keystore") | null>(null);

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

  const wordCount = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;

  const handlePhraseChange = useCallback(async (value: string) => {
    setPhrase(value);
    phraseRef.current = value;

    const trimmed = value.trim();
    if (!trimmed) {
      setPhraseValid(null);
      return;
    }

    if (!keystoreModuleRef.current) {
      keystoreModuleRef.current = await import("@swapkit/wallet-keystore");
    }
    // Re-read trimmed value from ref to avoid acting on a stale closure if newer keystrokes have arrived
    setPhraseValid(keystoreModuleRef.current.validatePhrase(phraseRef.current.trim()));
  }, []);

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

      const encrypted = await encryptToKeyStore(phraseRef.current.trim(), password);
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
    } catch {
      setPasswordError("Something went wrong while importing the wallet.");
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
          <DialogTitle>Import wallet from phrase</DialogTitle>
        </DialogHeader>

        <Tabs value={currentStep.toString()}>
          <TabsList className="sk-ui-w-full sk-ui-gap-2 sk-ui-h-auto sk-ui-p-0">
            <TabsTrigger className={cn(currentStep > 1 && "!sk-ui-bg-accent")} value="1" variant="stepper" />
            <TabsTrigger className={cn(currentStep > 2 && "!sk-ui-bg-accent")} value="2" variant="stepper" />
            <TabsTrigger className={cn(currentStep >= 3 && "!sk-ui-bg-accent")} value="3" variant="stepper" />
          </TabsList>

          {/* Step 1: Enter Phrase */}
          <TabsContent value="1">
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
              <span className="sk-ui-text-sm sk-ui-text-white sk-ui-text-opacity-65">
                Enter your 12 or 24 word recovery phrase to import your wallet.
              </span>

              <Textarea
                autoComplete="off"
                className="sk-ui-min-h-24 sk-ui-resize-none sk-ui-font-mono sk-ui-text-sm"
                onChange={(e) => handlePhraseChange(e.target.value)}
                placeholder="Enter your 12 or 24 word recovery phrase..."
                spellCheck={false}
                value={phrase}
              />

              <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
                <span className="sk-ui-text-xs sk-ui-text-muted-foreground">
                  {wordCount} {wordCount === 1 ? "word" : "words"}
                </span>

                {phraseValid !== null && (
                  <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1">
                    {phraseValid ? (
                      <>
                        <CheckCircleIcon className="sk-ui-h-3.5 sk-ui-w-3.5 sk-ui-text-green-500" />
                        <span className="sk-ui-text-xs sk-ui-text-green-500">Valid phrase</span>
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="sk-ui-h-3.5 sk-ui-w-3.5 sk-ui-text-red-400" />
                        <span className="sk-ui-text-xs sk-ui-text-red-400">Invalid phrase</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="sk-ui-mt-4">
              <Button onClick={() => modal.resolve({ confirmed: false })} type="button">
                Cancel
              </Button>

              <Button disabled={!phraseValid} onClick={() => setCurrentStep(2)} type="button" variant="primary">
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
                Import Wallet
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Step 3: Connecting + Success */}
          <TabsContent value="3">
            {isConnecting ? (
              <div className="sk-ui-mt-4 sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-3 sk-ui-py-4">
                  <div className="sk-ui-h-8 sk-ui-w-8 sk-ui-animate-spin sk-ui-rounded-full sk-ui-border-2 sk-ui-border-accent sk-ui-border-t-transparent" />
                  <p className="sk-ui-text-sm sk-ui-text-muted-foreground">Importing and connecting your wallet...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="sk-ui-mt-4 sk-ui-flex sk-ui-flex-col sk-ui-gap-4 sk-ui-text-center">
                  <div className="sk-ui-rounded-md sk-ui-border sk-ui-border-green-500/20 sk-ui-bg-green-500/10 sk-ui-p-4">
                    <CheckIcon className="sk-ui-mx-auto sk-ui-mb-2 sk-ui-h-8 sk-ui-w-8 sk-ui-text-green-500" />
                    <h3 className="sk-ui-mb-1 sk-ui-font-medium sk-ui-text-green-300">Wallet Imported Successfully!</h3>
                    <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
                      Your wallet has been imported and connected. Download your keystore file to access your wallet in
                      the future.
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
