package com.example.module.oreo;

import com.example.genie.GenieRuntime;
import com.example.genie.module.BaseGenieGlueModule;
import com.example.genie.module.database.DatabaseModule;
import com.example.genie.module.jdbc.JdbcModule;
import com.example.genie.module.rest.RestModule;
import com.example.genie.module.spring.SpringModule;
import com.example.genie.module.sql.SqlModule;
import com.example.genie.type.TopologicalSortable;
import java.util.ArrayList;
import java.util.List;

public class OreoModule extends BaseGenieGlueModule {
    private final OreoModuleConfiguration configuration = new OreoModuleConfiguration(this);

    @Override
    public String getName() {
        return "oreo";
    }

    @Override
    public OreoModuleConfiguration getConfiguration() {
        return configuration;
    }

    @Override
    public void initialise(GenieRuntime runtime) {  }

    @Override
    public List<String> getGluePaths() {
        List<String> gluePaths = new ArrayList<>();
        gluePaths.add("classpath:com.example.module.oreo.glue");
        gluePaths.add("classpath:snippet");
        return gluePaths;
    }

    @Override
    public Class<? extends TopologicalSortable>[] getDependencies() {
        return new Class[]{
            SpringModule.class,
            RestModule.class,
            JdbcModule.class,
            SqlModule.class,
            DatabaseModule.class
        };
    }
}
