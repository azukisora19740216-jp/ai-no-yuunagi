export interface ReadinessCheck {
  verify(): Promise<void>;
}
