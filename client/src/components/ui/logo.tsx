
import Image from './image';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <Image 
        src="/attached_assets/Untitled design.jpeg"
        alt="Logo"
        className="h-8 w-8 rounded"
      />
      <span className="font-bold text-lg">Strive</span>
    </div>
  );
}
