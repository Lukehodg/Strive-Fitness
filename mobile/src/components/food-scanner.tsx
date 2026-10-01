import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Action, Card, Copy, Feedback, Screen } from "./ui";
import { lookupBarcode, type ScannedFood } from "../lib/barcode";

export function FoodScanner({
  onClose,
  onProduct,
}: {
  onClose: () => void;
  onProduct: (product: ScannedFood, basis: "100g" | "100ml") => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<ScannedFood | null>(null);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      sub.remove();
      controller.current?.abort();
    };
  }, []);
  async function scan(code: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const result = await lookupBarcode(code, abort.signal);
      if (!abort.signal.aborted) setProduct(result);
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "Lookup timed out. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Lookup failed. Try again or enter manually.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <Screen>
        <Copy strong>Scan your food</Copy>
        <Copy>
          Point the camera at the barcode on the packaging. Only the barcode is
          sent to Open Food Facts; camera images are not uploaded.
        </Copy>
        {!permission ? (
          <Copy>Checking camera access...</Copy>
        ) : !permission.granted ? (
          <Card>
            <Copy>
              Allow camera access to scan a barcode. You can also enter food
              manually.
            </Copy>
            <Action
              label={
                permission.canAskAgain ? "Allow camera" : "Open phone settings"
              }
              onPress={() => {
                void (
                  permission.canAskAgain
                    ? requestPermission()
                    : Linking.openSettings()
                ).catch(() =>
                  setError(
                    "Could not open camera permissions. Check your phone settings.",
                  ),
                );
              }}
            />
          </Card>
        ) : active && !busy && !error && !product ? (
          <View style={{ height: 280, borderRadius: 20, overflow: "hidden" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
              }}
              onBarcodeScanned={(event) => {
                void scan(event.data);
              }}
              onMountError={() =>
                setError(
                  "Camera unavailable. Try again or enter food manually.",
                )
              }
            />
          </View>
        ) : null}
        {busy && <Copy>Looking up nutrition...</Copy>}
        <Feedback message={error} error />
        {product && (
          <Card>
            <Copy strong>{product.name || "Unnamed product"}</Copy>
            <Copy>
              Open Food Facts provides values per 100 g or 100 ml. Check your
              packaging and choose the matching unit. Missing nutrition values
              will need filling in.
            </Copy>
            <Copy>
              {product.values.calories || "?"} kcal | P{" "}
              {product.values.protein || "?"} g | C{" "}
              {product.values.carbs || "?"} g | F {product.values.fat || "?"} g
            </Copy>
            <Action
              label="Review per 100 g"
              onPress={() => onProduct(product, "100g")}
            />
            <Action
              secondary
              label="Review per 100 ml"
              onPress={() => onProduct(product, "100ml")}
            />
            <Action
              secondary
              label="Open Food Facts product & source"
              onPress={() => {
                void Linking.openURL(
                  `https://world.openfoodfacts.org/product/${product.barcode}`,
                ).catch(() => setError("Could not open the source page."));
              }}
            />
            <Copy>
              Open Food Facts contributors, ODbL. Verify nutrition against your
              label before saving.
            </Copy>
          </Card>
        )}
        {(!!error || !!product) && (
          <Action
            secondary
            label="Scan another barcode"
            onPress={() => {
              locked.current = false;
              setError("");
              setProduct(null);
            }}
          />
        )}
        <Action
          secondary
          label="Close scanner / enter manually"
          onPress={onClose}
        />
      </Screen>
    </Modal>
  );
}
