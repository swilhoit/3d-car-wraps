import Image from 'next/image'

export default function Header() {
  return (
    <div className="fixed top-4 left-4 z-50 pointer-events-none">
      <Image
        src="/coco-Logo-Full-square-w.png"
        alt="Logo"
        width={120}
        height={120}
        className="object-contain drop-shadow-2xl"
        priority
      />
    </div>
  )
}