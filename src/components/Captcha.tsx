import ReCAPTCHA from "react-google-recaptcha";

interface CaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function Captcha({ onVerify, onExpire }: CaptchaProps) {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  
  return (
    <div className="flex justify-center">
      <ReCAPTCHA
        sitekey={siteKey}
        onChange={onVerify}
        onExpired={onExpire}
      />
    </div>
  );
}