CREATE TABLE "answerchoice" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "answerchoice_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"description" varchar NOT NULL,
	"surveyid" integer NOT NULL,
	"surveypos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveyquestion" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "surveyquestion_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"question" varchar NOT NULL,
	"description" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(64) NOT NULL UNIQUE,
	"password" text NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"fullname" varchar(255) NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"answerchoiceid" integer,
	"userid" integer,
	"surveyid" integer,
	CONSTRAINT "vote_pkey" PRIMARY KEY("answerchoiceid","userid","surveyid")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "surveyid" ON "answerchoice" ("id","surveyid");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_in_survey" ON "answerchoice" ("surveyid","surveypos");--> statement-breakpoint
CREATE INDEX "is_a_user" ON "vote" ("userid");--> statement-breakpoint
CREATE INDEX "is_a_surveyquestion" ON "vote" ("surveyid");--> statement-breakpoint
ALTER TABLE "answerchoice" ADD CONSTRAINT "answerchoice_surveyid_surveyquestion_id_fkey" FOREIGN KEY ("surveyid") REFERENCES "surveyquestion"("id");--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "is_a_answerchoice" FOREIGN KEY ("answerchoiceid","surveyid") REFERENCES "answerchoice"("id","surveyid");--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_surveyquestion_fk" FOREIGN KEY ("surveyid") REFERENCES "surveyquestion"("id");--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_fk" FOREIGN KEY ("userid") REFERENCES "users"("id");
