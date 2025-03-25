import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { BrowserMultiFormatReader, Result, BarcodeFormat } from '@zxing/library';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  useEffect(() => {
    // Initialize barcode reader
    const hints = new Map();
    const formats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E];
    hints.set(2, formats);
    
    codeReaderRef.current = new BrowserMultiFormatReader(hints);
    
    // Start scanning if the component is mounted
    if (videoRef.current && isScanning) {
      startScanning();
    }
    
    // Cleanup function to stop scanning when component unmounts
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, []);
  
  const startScanning = async () => {
    if (!codeReaderRef.current || !videoRef.current) return;
    
    try {
      setIsScanning(true);
      setError(null);
      
      await codeReaderRef.current.decodeFromConstraints(
        {
          video: { facingMode: 'environment' }
        },
        videoRef.current,
        (result: Result | undefined, error: Error | undefined) => {
          if (result) {
            // Successfully scanned a barcode
            const barcode = result.getText();
            console.log('Scanned barcode:', barcode);
            setIsScanning(false);
            onScan(barcode);
          }
          
          if (error) {
            // Only set error if it's a critical error, not just failing to find a barcode
            if (error.name !== 'NotFoundException') {
              console.error('Barcode scanning error:', error);
              setError('Unable to access camera or scan barcode');
              setIsScanning(false);
            }
          }
        }
      );
    } catch (err) {
      console.error('Failed to start scanner:', err);
      setError('Failed to access camera. Please ensure camera permissions are enabled.');
      setIsScanning(false);
    }
  };
  
  const handleRetry = () => {
    setIsScanning(true);
    startScanning();
  };
  
  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      <div className="w-full max-w-lg mx-auto">
        <div className="relative aspect-[4/3] flex justify-center items-center">
          {isScanning ? (
            <>
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover"
                playsInline
              />
              <div className="absolute inset-0 border-2 border-dashed border-white opacity-70 m-8 rounded-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-40 w-40 border-2 border-yellow-400 animate-pulse rounded-lg"></div>
              </div>
            </>
          ) : (
            <div className="bg-gray-900 w-full h-full flex items-center justify-center text-white">
              {error ? (
                <div className="text-center p-4">
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button variant="outline" onClick={handleRetry}>
                    Try Again
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                  <span className="ml-2">Processing barcode...</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="bg-gray-900 p-4 text-white text-center">
          <p className="mb-4">Position the barcode within the box</p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={onClose}
              className="bg-transparent border-white text-white hover:bg-gray-800"
            >
              Cancel
            </Button>
            {!isScanning && error && (
              <Button
                onClick={handleRetry}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;