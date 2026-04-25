import {
  createSocialImageResponse,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@/lib/social-image";
import { siteConfig } from "@/lib/site-config";

export { contentType, size };

export const alt = siteConfig.socialImageAlt;

export default function Image() {
  return createSocialImageResponse("twitter");
}
