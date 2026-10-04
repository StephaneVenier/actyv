package fr.actyv.app;

import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class HealthConnectRationaleActivity extends AppCompatActivity {
    private static final String POLICY_URL = "https://a-ctyv.fr/legal/confidentialite#health-connect";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("Actyv - Health Connect");
        title.setTextSize(22);
        content.addView(title);
        TextView rationale = new TextView(this);
        rationale.setText("Actyv demande uniquement READ_STEPS pour lire le total des pas du jour. "
            + "Aucune ecriture dans Health Connect, aucune lecture de frequence cardiaque, calories ou autres donnees de sante. "
            + "Lorsque vous synchronisez, le total, la date, la source et la date de synchronisation sont enregistres dans Supabase "
            + "pour les statistiques, la regularite et les badges. Vous pouvez retirer l'autorisation dans Health Connect. "
            + "Supprimer votre compte Actyv ne supprime pas les donnees originales Health Connect.\n\n"
            + "Politique complete : " + POLICY_URL + "\nContact : contact@a-ctyv.fr");
        rationale.setTextSize(16);
        rationale.setPadding(0, padding, 0, padding);
        content.addView(rationale);
        Button policy = new Button(this);
        policy.setText("Politique de confidentialite");
        policy.setOnClickListener(view -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(POLICY_URL)));
            } catch (ActivityNotFoundException | SecurityException error) {
                Toast.makeText(this, "Aucun navigateur disponible. La politique est accessible a l'adresse indiquee.", Toast.LENGTH_LONG).show();
            }
        });
        content.addView(policy);
        Button close = new Button(this);
        close.setText("Fermer");
        close.setOnClickListener(view -> finish());
        content.addView(close);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }
}
