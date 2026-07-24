import { useId } from "react";

// This module intentionally co-locates the profiles with their only consumer.
// eslint-disable-next-line react-refresh/only-export-components
export const ERA_PROFILES = Object.freeze([
  Object.freeze({
    id: "atomic",
    label: "Atomic",
    year: 1958,
    description: "Enamel panels and instrument-green space-age restraint.",
  }),
  Object.freeze({
    id: "orbit",
    label: "Orbit",
    year: 1966,
    description: "Telemetry blue, modular grids, and precise mission labels.",
  }),
  Object.freeze({
    id: "analog",
    label: "Analog",
    year: 1977,
    description: "Warm amber signals and hi-fi control-room calm.",
  }),
  Object.freeze({
    id: "neon",
    label: "Neon",
    year: 1984,
    description: "Phosphor cyan and compact terminal energy.",
  }),
]);

export function EraDial({ value, onChange }) {
  const groupId = useId();

  return (
    <fieldset className="era-dial">
      <legend className="era-dial__legend">Console era</legend>
      <div className="era-dial__options">
        {ERA_PROFILES.map((profile) => {
          const inputId = `${groupId}-${profile.id}`;

          return (
            <label
              className="era-dial__option"
              htmlFor={inputId}
              key={profile.id}
            >
              <input
                checked={value === profile.id}
                className="era-dial__control"
                id={inputId}
                name={`${groupId}-era`}
                onChange={(event) => onChange(event.currentTarget.value)}
                type="radio"
                value={profile.id}
              />
              <span className="era-dial__label">
                {profile.label}
                <span className="era-dial__year">{profile.year}</span>
              </span>
              <span className="era-dial__description">
                {profile.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
