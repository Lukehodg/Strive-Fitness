import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Button } from '@/components/ui/button';
import { Loader2, CameraOff } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    // Configure scanner to look only for product barcodes (EAN, UPC, etc.)
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_128
    ]);
    
    // Create barcode reader
    const reader = new BrowserMultiFormatReader(hints);
    readerRef.current = reader;
    
    // Request camera permission
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        setCameraPermission(true);
        
        if (videoRef.current) {
          // Start continuous scanning
          reader.decodeFromConstraints(
            { video: { facingMode: 'environment' } },
            videoRef.current,
            (result, error) => {
              if (result && scanning) {
                setScanning(false);
                onScan(result.getText());
              }
              
              if (error && error.name !== 'NotFoundException') {
                console.error('Barcode scanning error:', error);
              }
            }
          );
        }
      })
      .catch(err => {
        console.error('Error accessing camera:', err);
        setCameraPermission(false);
        setError('Could not access camera. Please ensure camera permissions are granted.');
      });

    // Clean up on unmount
    return () => {
      if (readerRef.current) {
        readerRef.current.reset();
      }
    };
  }, [onScan, scanning]);

  const handleReset = () => {
    setScanning(true);
  };

  return (
    <div className="w-full">
      {cameraPermission === false ? (
        <div className="text-center py-6">
          <CameraOff className="w-12 h-12 mx-auto mb-2 text-red-500" />
          <p className="mb-4 text-red-500">{error}</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg aspect-[4/3] bg-black mb-4">
            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                <div className="w-64 h-48 border-2 border-white rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white"></div>
                  
                  {/* Scanning line animation */}
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-scan"></div>
                </div>
                <div className="mt-4 text-sm bg-black bg-opacity-70 p-2 rounded-lg">
                  <p className="font-semibold mb-1">Position barcode within the box</p>
                  <p className="text-xs">For best results, ensure good lighting and hold steady</p>
                </div>
              </div>
            )}
            
            {/* Video preview */}
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover"
            ></video>
            
            {/* Scanning indicator */}
            {scanning && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-full flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span className="text-sm">Scanning...</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={onClose}
            >
              Cancel
            </Button>
            
            {!scanning && (
              <Button onClick={handleReset}>
                Scan Again
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BarcodeScanner;