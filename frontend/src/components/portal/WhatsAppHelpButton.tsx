import { useBranding } from "@/components/portal/CompanyBrand";

export function WhatsAppHelpButton() {
  const { data } = useBranding();
  if (!data?.phone) return null;

  const digits = data.phone.replace(/\D/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent("Hi, I need help with my order.")}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.86 11.86 0 0 0 5.64 1.44h.01c6.53 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.44ZM12.05 21.4h-.01a9.6 9.6 0 0 1-4.9-1.34l-.35-.21-3.8 1 1.01-3.7-.23-.38a9.55 9.55 0 0 1-1.47-5.13c0-5.28 4.3-9.58 9.6-9.58 2.56 0 4.97 1 6.78 2.81a9.53 9.53 0 0 1 2.81 6.79c0 5.28-4.3 9.74-9.44 9.74Zm5.24-7.19c-.29-.14-1.7-.84-1.96-.93-.26-.1-.46-.14-.65.14-.19.29-.75.93-.92 1.12-.17.19-.34.21-.63.07-.29-.14-1.22-.45-2.32-1.43-.86-.76-1.44-1.71-1.6-2-.17-.29-.02-.44.13-.59.13-.13.29-.34.43-.5.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.65-1.58-.9-2.16-.24-.57-.48-.5-.65-.5-.17-.01-.36-.01-.55-.01-.19 0-.5.07-.76.36-.26.29-1 1-1 2.43 0 1.43 1.03 2.82 1.17 3.01.14.19 2.03 3.1 4.93 4.35.69.3 1.22.47 1.64.61.69.22 1.32.19 1.81.11.55-.08 1.7-.7 1.94-1.36.24-.67.24-1.25.17-1.36-.07-.12-.26-.19-.55-.33Z" />
      </svg>
      Help
    </a>
  );
}
