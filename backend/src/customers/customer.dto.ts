import { IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @Length(1, 80)
  name: string;
}

export class PushTokenDto {
  /** FCM registration token; null/empty to unregister. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string | null;
}

export class LocationDto {
  @IsString()
  @Length(1, 50)
  label: string;

  @IsString()
  @Length(1, 300)
  addressText: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landmarkNotes?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  addressText?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landmarkNotes?: string;
}
