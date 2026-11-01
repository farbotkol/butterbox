type CoastalIllustrationProps = {
  className?: string;
};

export function CoastalIllustration({ className }: CoastalIllustrationProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      preserveAspectRatio="xMidYMax slice"
      viewBox="0 0 640 220"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="510" cy="72" r="24" fill="#F4BC59" />
      <path d="M0 155 72 117l52 24 65-61 54 35 70-55 51 24 55-54 57 33 53-18 71 38v137H0V155Z" fill="#D9E7DF" />
      <path d="m0 163 86-25 64 18 77-56 59 30 74-43 50 25 73-58 49 34 63-4 44 24v112H0V163Z" fill="#A9C9BD" />
      <path d="M0 169c86-16 138-1 214-9 71-7 118-24 190-17 73 7 125-10 236-28v105H0v-51Z" fill="#83B9BC" />
      <path d="M0 189c70-13 139 4 203-1 88-7 139-22 221-15 76 6 143-9 216-22v69H0v-31Z" fill="#6EAAB0" />
      <path d="M0 210c80-13 139-2 214-5 91-4 147-18 220-12 69 5 139-8 206-17v44H0v-10Z" fill="#F1E7D5" />
      <path d="M0 190c52-7 87-8 131-2m166-17c38-5 69-5 102-1m97-17c31-5 57-9 91-10" stroke="#FAF9F6" strokeLinecap="round" strokeOpacity=".9" strokeWidth="3" />
      <path d="M0 206c58-8 101-3 148 0m176-8c37-4 70-3 105 0m94-11c37-6 69-9 117-8" stroke="#FAF9F6" strokeLinecap="round" strokeOpacity=".75" strokeWidth="2" />
    </svg>
  );
}