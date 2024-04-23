import { BridgeConfig } from "./types";
import { createPemString, getCertificate, getUsernameFromBridge } from "../helpers/hueNetworking";

export async function getBridgeConfig(
  bridgeIpAddress: string,
  bridgeId?: string,
  bridgeUsername?: string,
): Promise<BridgeConfig> {
  const bridgeCertificate = await getCertificate(bridgeIpAddress, bridgeId);
  const isSelfSigned = bridgeCertificate.subject.CN === bridgeCertificate.issuer.CN;
  const pemString = createPemString(bridgeCertificate);
  const selfSignedCertificate = isSelfSigned ? Buffer.from(pemString, "utf-8") : undefined;

  return {
    ipAddress: bridgeIpAddress,
    username: bridgeUsername
      ? bridgeUsername
      : await getUsernameFromBridge(bridgeIpAddress, bridgeId, selfSignedCertificate),
    id: bridgeId ? bridgeId : bridgeCertificate.subject.CN,
    selfSignedCertificate: isSelfSigned ? pemString : undefined,
  };
}
