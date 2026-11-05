/** Minimal types for the Khronos glTF-Validator npm package (it ships none). */
declare module 'gltf-validator' {
  export interface ValidatorMessage {
    code: string;
    message: string;
    /** 0 error, 1 warning, 2 info, 3 hint. */
    severity: number;
    pointer?: string;
  }
  export interface ValidatorReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: ValidatorMessage[];
      truncated: boolean;
    };
    info?: {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
      resources?: {
        pointer: string;
        mimeType?: string;
        image?: { width: number; height: number };
      }[];
      totalTriangleCount?: number;
      drawCallCount?: number;
      maxUVs?: number;
    };
  }
  const validator: {
    version(): string;
    validateBytes(
      data: Uint8Array,
      options?: { uri?: string; format?: 'glb' | 'gltf'; maxIssues?: number },
    ): Promise<ValidatorReport>;
  };
  export default validator;
}
