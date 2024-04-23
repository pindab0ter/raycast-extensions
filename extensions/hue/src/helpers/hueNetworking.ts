import { APP_NAME } from "./constants";
import tls, { PeerCertificate } from "tls";
import * as https from "https";
import { HueApiService, LinkResponse, MDnsService } from "../lib/types";
import Bonjour from "bonjour-service";
import { isIPv4 } from "net";
import fs from "fs";
import * as path from "node:path";
import { environment } from "@raycast/api";

/**
 * Ignoring that you could have more than one Hue Bridge on a network as this is unlikely in 99.9% of users situations
 */
export async function discoverBridgeUsingHuePublicApi(): Promise<{ ipAddress: string; id: string }> {
  console.info("Discovering bridge using MeetHue's public API…");

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "discovery.meethue.com",
      path: "/",
      method: "GET",
    };

    const request = https.request(options, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        if (response.statusCode !== 200) {
          return reject(`Unexpected status code from MeetHue's public API: ${response.statusCode}`);
        }

        if (data === "") {
          return reject("Could not find a Hue Bridge using MeetHue's public API");
        }

        const hueApiResults: HueApiService[] = JSON.parse(data);

        if (hueApiResults.length === 0) {
          return reject("Could not find a Hue Bridge using MeetHue's public API");
        }

        const ipAddress = hueApiResults[0].internalipaddress;
        const id = hueApiResults[0].id;

        console.info(`Discovered Hue Bridge using MeetHue's public API: ${ipAddress}, ${id}`);
        return resolve({ ipAddress, id });
      });
    });

    request.on("error", (error) => {
      return reject(`Could not find a Hue Bridge using MeetHue's public API ${error.message}`);
    });

    request.end();
  });
}

/**
 * Ignoring that you could have more than one Hue Bridge on a network as this is unlikely in 99.9% of users situations
 */
export async function discoverBridgeUsingMdns(): Promise<{ ipAddress: string; id: string }> {
  console.info("Discovering bridge using mDNS…");

  return new Promise((resolve, reject) => {
    const browser = new Bonjour().findOne({ type: "hue", protocol: "tcp" });

    browser.on("up", (service: MDnsService) => {
      const ipAddress = service.addresses.find((address) => isIPv4(address));
      const id = service.txt.bridgeid;

      console.info(`Discovered Hue Bridge using mDNS: ${ipAddress}, ${id}`);
      return ipAddress ? resolve({ ipAddress, id }) : reject("Could not find a Hue Bridge using mDNS");
    });

    browser.on("down", () => {
      return reject("Could not find a Hue Bridge using mDNS");
    });

    setTimeout(() => {
      browser.stop();
      return reject("Could not find a Hue Bridge using mDNS");
    }, 10000);
  });
}

/**
 * Validates the certificate of a Hue Bridge.
 *
 * The Hue Bridge uses either a self-signed certificate, or a certificate signed by a root-bridge certificate.
 * In both cases, the CN (common name) of the certificate is the ID of the Hue Bridge, which is a 16 character hex string.
 * The CN of a self-signed certificate is also the ID of the Hue Bridge.
 * The CN of a certificate signed by the Hue Bridge root certificate is 'root-bridge'.
 *
 * @link https://developers.meethue.com/develop/application-design-guidance/using-https/#Common%20name%20validation
 * @link https://developers.meethue.com/develop/application-design-guidance/using-https/#Self-signed%20certificates
 * @throws {Error} If the certificate is not valid
 */
function validateBridgeCertificate(peerCertificate: PeerCertificate, bridgeId?: string): void {
  const cnIsValidBridgeId = /^([0-9a-fA-F]){16}$/.test(peerCertificate.subject.CN);
  const subjectCnIsBridgeId = peerCertificate.subject.CN === bridgeId;
  const hasValidSelfSignedCertificate = peerCertificate.subject.CN === peerCertificate.issuer.CN;
  const isRootBridgeCertificate = peerCertificate.issuer.CN === "root-bridge";

  console.debug(
    `Validating certificate of Hue Bridge with ID ${bridgeId}:\n`,
    `Subject CN is Bridge ID: ${subjectCnIsBridgeId}\n`,
    `Has valid self-signed certificate: ${hasValidSelfSignedCertificate}\n`,
    `Is root bridge certificate: ${isRootBridgeCertificate}\n`,
    `Certificate subject: ${JSON.stringify(peerCertificate.subject)}\n`,
    `Certificate issuer: ${JSON.stringify(peerCertificate.issuer)}`,
  );

  if (!cnIsValidBridgeId) {
    throw new Error(`The CN of the certificate is not a valid Hue Bridge ID: ${peerCertificate.subject.CN}`);
  }

  if (!subjectCnIsBridgeId) {
    throw new Error("Certificate subject’s Common Name does not match the Bridge ID");
  }

  if (!hasValidSelfSignedCertificate && !isRootBridgeCertificate) {
    throw new Error("Certificate issuer’s Common Name does not match the expected value");
  }
}

export async function getUsernameFromBridge(
  ipAddress: string,
  bridgeId: string | undefined,
  selfSignedCertificate: Buffer | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const caCertificate = fs.readFileSync(path.join(environment.assetsPath, "huebridge_cacert.pem"));
    const request = https.request(
      {
        method: "POST",
        path: "/api",
        hostname: ipAddress,
        port: 443,
        ca: caCertificate,
        cert: selfSignedCertificate,
        rejectUnauthorized: false,
        agent: new https.Agent({
          checkServerIdentity(_, peerCertificate) {
            validateBridgeCertificate(peerCertificate, bridgeId);

            return undefined;
          },
        }),
        headers: {
          "Content-Type": "application/json",
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          return reject(`Unexpected status code from Hue Bridge: ${response.statusCode}`);
        }

        response.on("data", (data) => {
          const response: LinkResponse = JSON.parse(data.toString())[0];
          if (response.error?.description) {
            const errorDescription = response.error.description;
            return reject(errorDescription.charAt(0).toUpperCase() + errorDescription.slice(1));
          }
          if (response.success) {
            return resolve(response.success.username);
          }
        });
      },
    );

    request.write(
      JSON.stringify({
        devicetype: APP_NAME,
        generateclientkey: true,
      }),
    );

    request.end();
  });
}

export function getCertificate(host: string, bridgeId?: string): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: 443,
      requestCert: true,
      rejectUnauthorized: false,
    });

    socket.on("secureConnect", () => {
      console.log("Getting certificate from the Hue Bridge…");
      socket.end();
      const peerCertificate: PeerCertificate = socket.getPeerCertificate();

      try {
        validateBridgeCertificate(peerCertificate, bridgeId);
      } catch (error) {
        return reject(error);
      }

      return resolve(peerCertificate);
    });

    socket.on("error", (error) => {
      return reject(error);
    });
  });
}

export function createPemString(cert: PeerCertificate): string {
  const insertNewlines = (str: string): string => {
    const regex = new RegExp(`(.{64})`, "g");
    return str.replace(regex, "$1\n");
  };
  const base64 = cert.raw.toString("base64");
  return `-----BEGIN CERTIFICATE-----\n${insertNewlines(base64)}-----END CERTIFICATE-----\n`;
}
